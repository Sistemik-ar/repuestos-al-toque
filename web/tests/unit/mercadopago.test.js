import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPaymentLink } from '@/lib/mercadopago';

beforeEach(() => { process.env.MP_ACCESS_TOKEN = 'TEST-token'; });
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
