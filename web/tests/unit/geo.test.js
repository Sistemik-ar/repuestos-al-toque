import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocode } from '@/lib/geo';

afterEach(() => vi.restoreAllMocks());

describe('geocode (Nominatim)', () => {
  it('devuelve {lat,lng} cuando hay resultado', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ lat: '-41.133', lon: '-71.310' }] });
    expect(await geocode('Av. Bustillo 1240')).toEqual({ lat: -41.133, lng: -71.31 });
  });
  it('devuelve null si no hay resultados', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    expect(await geocode('direccion inexistente zzz')).toBeNull();
  });
  it('devuelve null con dirección vacía', async () => {
    expect(await geocode('')).toBeNull();
  });
});
