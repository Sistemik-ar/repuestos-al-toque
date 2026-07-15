import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPaymentLink, mpOAuthConfigured, mpOAuthUrl, mpExchangeCode, mpRefresh, getPayment } from '@/lib/mercadopago';

beforeEach(() => {
  process.env.MP_ACCESS_TOKEN = 'TEST-token';
  delete process.env.MP_TEST_ACCESS_TOKEN; // que no entre en modo sandbox por error
  delete process.env.MP_CLIENT_ID;
  delete process.env.MP_CLIENT_SECRET;
});
afterEach(() => { vi.restoreAllMocks(); });

describe('createPaymentLink', () => {
  it('crea la preferencia y devuelve el link de pago', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'pref123', init_point: 'https://mp/checkout', sandbox_init_point: 'https://mp/sandbox' }) });
    const r = await createPaymentLink({ orderRef: 'r1::q1', title: 'Repuesto', amount: 45000, backUrl: 'https://app/api/mp/return' });
    expect(r.preferenceId).toBe('pref123');
    expect(r.link).toBe('https://mp/checkout');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.external_reference).toBe('r1::q1');
    expect(body.items[0].unit_price).toBe(45000);
    expect(body.auto_return).toBe('approved'); // https -> sí
  });

  it('excluye efectivo/cupón (ticket) y cajero (atm) -> el pago siempre confirma o rechaza, nunca queda pendiente', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'p', init_point: 'x' }) });
    await createPaymentLink({ orderRef: 'r1::q1', title: 'Repuesto', amount: 45000, backUrl: 'https://app/api/mp/return' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const excluded = (body.payment_methods?.excluded_payment_types || []).map((t) => t.id);
    expect(excluded).toContain('ticket'); // Rapipago / Pago Fácil / efectivo
    expect(excluded).toContain('atm');    // depósito en cajero
  });

  it('falla si no hay token', async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await expect(createPaymentLink({ title: 'x', amount: 1 })).rejects.toThrow();
  });

  it('propaga el error de Mercado Pago', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: 'invalid token' }) });
    await expect(createPaymentLink({ title: 'x', amount: 1 })).rejects.toThrow('invalid token');
  });

  it('no manda auto_return con back_url http (localhost)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'p', init_point: 'x' }) });
    await createPaymentLink({ title: 'x', amount: 1, backUrl: 'http://localhost:3000/api/mp/return' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.auto_return).toBeUndefined();
  });
});

describe('Split de pagos (Marketplace / OAuth)', () => {
  it('mpOAuthConfigured: true solo con client_id + client_secret', () => {
    expect(mpOAuthConfigured()).toBe(false);
    process.env.MP_CLIENT_ID = 'APP';
    expect(mpOAuthConfigured()).toBe(false); // falta el secret
    process.env.MP_CLIENT_SECRET = 'SEC';
    expect(mpOAuthConfigured()).toBe(true);
  });

  it('mpOAuthUrl arma la URL de autorización (client_id, code, state, redirect_uri)', () => {
    process.env.MP_CLIENT_ID = 'APP123';
    const url = mpOAuthUrl({ state: 'store-1', redirectUri: 'https://app/api/mp/oauth/callback' });
    expect(url.startsWith('https://auth.mercadopago.com/authorization?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('client_id')).toBe('APP123');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('state')).toBe('store-1');
    expect(q.get('redirect_uri')).toBe('https://app/api/mp/oauth/callback');
  });

  it('con sellerToken: usa el token del comercio y agrega marketplace_fee', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'p', init_point: 'x' }) });
    await createPaymentLink({ orderRef: 'job::1', title: 'x', amount: 41895, sellerToken: 'SELLER-tok', marketplaceFee: 1995 });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer SELLER-tok'); // el del comercio, NO el de la plataforma
    expect(JSON.parse(opts.body).marketplace_fee).toBe(1995);
  });

  it('sin sellerToken: token de la plataforma y SIN marketplace_fee (cobro centralizado)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'p', init_point: 'x' }) });
    await createPaymentLink({ orderRef: 'job::1', title: 'x', amount: 41895 });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer TEST-token');
    expect(JSON.parse(opts.body).marketplace_fee).toBeUndefined();
  });

  it('no agrega marketplace_fee si es 0 (ej: todo a cuenta corriente)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'p', init_point: 'x' }) });
    await createPaymentLink({ orderRef: 'job::1', title: 'x', amount: 100, sellerToken: 'S', marketplaceFee: 0 });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).marketplace_fee).toBeUndefined();
  });

  it('mpExchangeCode: POST a /oauth/token (authorization_code) con credenciales y redirect', async () => {
    process.env.MP_CLIENT_ID = 'APP'; process.env.MP_CLIENT_SECRET = 'SEC';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'A', refresh_token: 'R', user_id: 9, expires_in: 100 }) });
    const r = await mpExchangeCode({ code: 'CODE', redirectUri: 'https://app/cb' });
    expect(r.access_token).toBe('A');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    const body = JSON.parse(opts.body);
    expect(body.grant_type).toBe('authorization_code');
    expect(body.code).toBe('CODE');
    expect(body.client_id).toBe('APP');
    expect(body.client_secret).toBe('SEC');
    expect(body.redirect_uri).toBe('https://app/cb');
  });

  it('mpRefresh: POST a /oauth/token con grant_type refresh_token', async () => {
    process.env.MP_CLIENT_ID = 'APP'; process.env.MP_CLIENT_SECRET = 'SEC';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'A2' }) });
    await mpRefresh('REF');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.grant_type).toBe('refresh_token');
    expect(body.refresh_token).toBe('REF');
  });

  it('getPayment sin token: consulta con el token de la plataforma (cobro centralizado)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1, status: 'approved' }) });
    await getPayment('123');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer TEST-token');
  });

  it('getPayment con token del comercio: lo usa en vez del de la plataforma (pago con split)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 1, status: 'approved' }) });
    await getPayment('123', 'SELLER-tok');
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer SELLER-tok');
  });

  it('propaga el error de OAuth de Mercado Pago', async () => {
    process.env.MP_CLIENT_ID = 'APP'; process.env.MP_CLIENT_SECRET = 'SEC';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    await expect(mpExchangeCode({ code: 'bad', redirectUri: 'x' })).rejects.toThrow('invalid_grant');
  });
});
