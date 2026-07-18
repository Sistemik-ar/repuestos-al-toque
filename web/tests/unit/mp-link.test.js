import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { preferenceIdFromLink, deactivatePaymentLink } from '@/lib/mercadopago';

const LINK = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=3458578874-5ace8199-d834-4187-a247-1b81edbecf61';
const PREF = '3458578874-5ace8199-d834-4187-a247-1b81edbecf61';

beforeEach(() => {
  process.env.MP_ACCESS_TOKEN = 'TEST-token';
  delete process.env.MP_TEST_ACCESS_TOKEN;
});
afterEach(() => vi.unstubAllGlobals());

describe('preferenceIdFromLink', () => {
  it('saca el pref_id del init_point', () => {
    expect(preferenceIdFromLink(LINK)).toBe(PREF);
  });
  it('también del link de sandbox', () => {
    expect(preferenceIdFromLink(LINK.replace('www', 'sandbox'))).toBe(PREF);
  });
  it('devuelve null si no hay link o no es una URL con pref_id', () => {
    expect(preferenceIdFromLink(null)).toBe(null);
    expect(preferenceIdFromLink('')).toBe(null);
    expect(preferenceIdFromLink('no-es-una-url')).toBe(null);
    expect(preferenceIdFromLink('https://www.mercadopago.com.ar/checkout')).toBe(null);
  });
});

describe('deactivatePaymentLink', () => {
  it('vence la preferencia con un PUT y devuelve true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    expect(await deactivatePaymentLink(LINK)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.mercadopago.com/checkout/preferences/${PREF}`);
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer TEST-token');
    const body = JSON.parse(init.body);
    expect(body.expires).toBe(true);
    // la ventana de vigencia tiene que quedar en el pasado, si no el link sigue pagable
    expect(new Date(body.expiration_date_to).getTime()).toBeLessThan(Date.now());
  });

  it('usa el token del comercio cuando la preferencia es de otra cuenta (split)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await deactivatePaymentLink(LINK, 'TOKEN-del-comercio');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer TOKEN-del-comercio');
  });

  it('no llama a MP si el link no tiene pref_id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await deactivatePaymentLink(null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devuelve false (sin lanzar) si MP rechaza o la red falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await deactivatePaymentLink(LINK)).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    expect(await deactivatePaymentLink(LINK)).toBe(false);
  });
});
