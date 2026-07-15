import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    requestQuote: { findUnique: vi.fn(), update: vi.fn() },
    request: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({}) },
    storeProfile: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    mechanicProfile: { findUnique: vi.fn() },
    zone: { findMany: vi.fn().mockResolvedValue([]) },
    shippingTariff: { findMany: vi.fn() },
    setting: { findMany: vi.fn() },
    order: { upsert: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { confirmPaidByRef, jobSplit, sellerMpToken, getPaymentForStore } from '@/lib/orders';

beforeEach(() => vi.clearAllMocks());

describe('confirmPaidByRef', () => {
  it('devuelve false con ref inválido', async () => {
    expect(await confirmPaidByRef('')).toBe(false);
    expect(await confirmPaidByRef('sinseparador')).toBe(false);
  });

  it('devuelve false si la cotización no existe', async () => {
    prisma.requestQuote.findUnique.mockResolvedValue(null);
    expect(await confirmPaidByRef('r1::q1')).toBe(false);
  });

  it('crea la orden (con comisión 5% y envío mínimo) y marca el pedido pagado', async () => {
    prisma.requestQuote.findUnique.mockResolvedValue({ id: 'q1', requestId: 'r1', storeId: 's1', price: 39900, request: { mechanicId: 'm1' } });
    prisma.request.findUnique.mockResolvedValue({ mechanicId: 'm1' });
    prisma.storeProfile.findUnique.mockResolvedValue({ lat: null, lng: null });
    prisma.mechanicProfile.findUnique.mockResolvedValue({ lat: null, lng: null });
    prisma.shippingTariff.findMany.mockResolvedValue([]);
    prisma.setting.findMany.mockResolvedValue([]); // usa defaults: comisión 5%, sin recargo
    prisma.order.upsert.mockResolvedValue({});
    prisma.requestQuote.update.mockResolvedValue({});
    prisma.request.update.mockResolvedValue({});

    const ok = await confirmPaidByRef('r1::q1');
    expect(ok).toBe(true);

    const arg = prisma.order.upsert.mock.calls[0][0];
    expect(arg.create.partAmount).toBe(39900);
    expect(arg.create.commissionAmount).toBe(1995); // 5%
    expect(arg.create.freightAmount).toBe(5000); // mínimo, sin coordenadas
    expect(arg.create.total).toBe(39900 + 1995 + 5000);
    expect(prisma.request.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAID' } }));
  });
});

describe('confirmPaidByRef — coordinación interna (zona sin delivery)', () => {
  it('mecánico de El Bolsón: no cobra flete y marca la orden como internalFreight', async () => {
    const BOLSON = { id: 2, slug: 'el-bolson', name: 'El Bolsón', latMin: -42.05, latMax: -41.85, lngMin: -71.65, lngMax: -71.40, active: true, deliveryEnabled: false, storesEnabled: false };
    prisma.requestQuote.findUnique.mockResolvedValue({ id: 'q1', requestId: 'r1', storeId: 's1', price: 39900, request: { mechanicId: 'm1' } });
    prisma.mechanicProfile.findUnique.mockResolvedValue({ zoneId: 2, lat: -41.96, lng: -71.53, zone: BOLSON });
    prisma.setting.findMany.mockResolvedValue([]); // defaults: comisión 5%
    prisma.order.upsert.mockResolvedValue({});
    prisma.requestQuote.update.mockResolvedValue({});
    prisma.request.update.mockResolvedValue({});

    expect(await confirmPaidByRef('r1::q1')).toBe(true);
    const arg = prisma.order.upsert.mock.calls[0][0];
    expect(arg.create.internalFreight).toBe(true);
    expect(arg.create.freightAmount).toBeNull(); // no es un envío gratis: no hay flete de la app
    expect(arg.create.total).toBe(39900 + 1995); // repuesto + comisión, sin envío
  });
});

describe('confirmPaidByRef — trabajo (job::)', () => {
  it('paga todos los ítems elegidos y cobra UN envío por comercio', async () => {
    prisma.job = { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) };
    prisma.job.findUnique.mockResolvedValue({
      id: 'j1', mechanicId: 'm1',
      requests: [
        { id: 'r1', status: 'CLOSED', quotes: [{ id: 'q1', status: 'SELECTED', storeId: 's1', price: 80000 }] },
        { id: 'r2', status: 'CLOSED', quotes: [{ id: 'q2', status: 'SELECTED', storeId: 's1', price: 20000 }] },
        { id: 'r3', status: 'CLOSED', quotes: [{ id: 'q3', status: 'SENT', storeId: 's2', price: 99999 }] }, // no elegido
      ],
    });
    prisma.request.findUnique.mockResolvedValue({ mechanicId: 'm1' });
    prisma.storeProfile.findUnique.mockResolvedValue({ lat: null, lng: null });
    prisma.mechanicProfile.findUnique.mockResolvedValue({ lat: null, lng: null });
    prisma.shippingTariff.findMany.mockResolvedValue([]);
    prisma.setting.findMany.mockResolvedValue([]);
    prisma.order.upsert.mockResolvedValue({});
    prisma.request.update.mockResolvedValue({});

    const ok = await confirmPaidByRef('job::j1');
    expect(ok).toBe(true);
    expect(prisma.order.upsert).toHaveBeenCalledTimes(2); // solo los elegidos
    const ships = prisma.order.upsert.mock.calls.map((c) => c[0].create.freightAmount);
    expect(ships.filter((x) => x > 0)).toHaveLength(1); // mismo comercio -> 1 solo flete
    expect(prisma.job.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAID' } }));
  });
});

describe('jobSplit — split de pagos vs cobro centralizado (cuenta de Jorge)', () => {
  // total = repuestos + comisión + flete + recargo. La plataforma retiene total − repuestos.
  const plan = (stores, { total = 100000, parts = 80000 } = {}) => ({
    stores, items: stores > 0 ? [{ storeId: 'store-1' }] : [], totals: { total, parts },
  });

  it('un comercio que vinculó su MP → SPLIT: usa su token y retiene total − repuestos', () => {
    const r = jobSplit(plan(1, { total: 100000, parts: 80000 }), 'SELLER-tok');
    expect(r.sellerToken).toBe('SELLER-tok'); // cobra el comercio
    expect(r.marketplaceFee).toBe(20000);     // comisión + flete + recargo se los queda la plataforma
  });

  it('un comercio SIN vincular → CENTRALIZADO (cuenta de Jorge): sin token de comercio ni fee', () => {
    const r = jobSplit(plan(1), null); // sellerMpToken devolvió null (no conectó MP)
    expect(r.sellerToken).toBeNull();   // null → createPaymentLink usa el token de la plataforma
    expect(r.marketplaceFee).toBe(0);
  });

  it('varios comercios (aunque uno tenga token) → CENTRALIZADO: el split es solo para un comercio', () => {
    const r = jobSplit(plan(2), 'SELLER-tok');
    expect(r.sellerToken).toBeNull();
    expect(r.marketplaceFee).toBe(0);
  });

  it('repuesto 100% a cuenta corriente (parts=0) → la plataforma retiene todo lo cobrado', () => {
    const r = jobSplit(plan(1, { total: 25000, parts: 0 }), 'SELLER-tok');
    expect(r.sellerToken).toBe('SELLER-tok');
    expect(r.marketplaceFee).toBe(25000); // el repuesto lo liquida el comercio por CC; acá no va nada a su MP
  });
});

describe('sellerMpToken — token OAuth del comercio (split)', () => {
  beforeEach(() => { process.env.MP_CLIENT_ID = 'APP'; process.env.MP_CLIENT_SECRET = 'SEC'; });

  it('devuelve null si el comercio no vinculó su MP', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue({ mpAccessToken: null });
    expect(await sellerMpToken('s1')).toBeNull();
  });

  it('token vigente: lo devuelve sin refrescar', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue({ mpAccessToken: 'TOK', mpRefreshToken: 'R', mpTokenExpires: new Date(Date.now() + 3600_000) });
    expect(await sellerMpToken('s1')).toBe('TOK');
    expect(prisma.storeProfile.update).not.toHaveBeenCalled();
  });

  it('token por vencer: lo refresca y guarda el nuevo', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue({ mpAccessToken: 'VIEJO', mpRefreshToken: 'R', mpTokenExpires: new Date(Date.now() + 60_000) });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'NUEVO', refresh_token: 'R2', expires_in: 100 }) });
    expect(await sellerMpToken('s1')).toBe('NUEVO');
    expect(prisma.storeProfile.update.mock.calls[0][0].data.mpAccessToken).toBe('NUEVO');
  });

  it('si el refresh falla, prueba con el token actual (no rompe el cobro)', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue({ mpAccessToken: 'VIEJO', mpRefreshToken: 'R', mpTokenExpires: new Date(Date.now() + 60_000) });
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    expect(await sellerMpToken('s1')).toBe('VIEJO');
  });
});

describe('getPaymentForStore — con qué token consulta el pago el webhook/return', () => {
  beforeEach(() => { process.env.MP_ACCESS_TOKEN = 'PLAT-tok'; delete process.env.MP_TEST_ACCESS_TOKEN; });

  it('sin hint de comercio → token de la plataforma (cobro centralizado, como siempre)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'approved' }) });
    await getPaymentForStore('123', null);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer PLAT-tok');
  });

  it('con hint ?store= → token del comercio (el pago del split vive en SU cuenta)', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue({ mpAccessToken: 'SELLER-tok', mpRefreshToken: null, mpTokenExpires: null });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'approved' }) });
    await getPaymentForStore('123', 's1');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer SELLER-tok');
  });

  it('si el token del comercio falla (revocado/desvinculado) → reintenta con el de la plataforma', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue({ mpAccessToken: 'REVOCADO', mpRefreshToken: null, mpTokenExpires: null });
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) }) // MP: 404 con el token del comercio
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'approved' }) });
    const pay = await getPaymentForStore('123', 's1');
    expect(pay.status).toBe('approved');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer PLAT-tok');
  });

  it('hint de un comercio sin token guardado → directo al de la plataforma', async () => {
    prisma.storeProfile.findUnique.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'approved' }) });
    await getPaymentForStore('123', 's1');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer PLAT-tok');
  });
});
