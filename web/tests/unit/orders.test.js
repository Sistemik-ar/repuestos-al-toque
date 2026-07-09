import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    requestQuote: { findUnique: vi.fn(), update: vi.fn() },
    request: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({}) },
    storeProfile: { findUnique: vi.fn() },
    mechanicProfile: { findUnique: vi.fn() },
    zone: { findMany: vi.fn().mockResolvedValue([]) },
    shippingTariff: { findMany: vi.fn() },
    setting: { findMany: vi.fn() },
    order: { upsert: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { confirmPaidByRef } from '@/lib/orders';

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
