import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocode, inBariloche } from '@/lib/geo';

afterEach(() => vi.restoreAllMocks());

describe('inBariloche (solo damos de alta direcciones de Bariloche)', () => {
  it('acepta el centro de Bariloche', () => {
    expect(inBariloche({ lat: -41.133, lng: -71.31 })).toBe(true);
  });
  it('acepta el Km de Av. Bustillo (oeste)', () => {
    expect(inBariloche({ lat: -41.13, lng: -71.54 })).toBe(true);
  });
  it('rechaza Buenos Aires', () => {
    expect(inBariloche({ lat: -34.6, lng: -58.38 })).toBe(false);
  });
  it('rechaza Neuquén capital', () => {
    expect(inBariloche({ lat: -38.95, lng: -68.06 })).toBe(false);
  });
  it('rechaza coords nulas/indefinidas', () => {
    expect(inBariloche(null)).toBe(false);
    expect(inBariloche(undefined)).toBe(false);
  });
});

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
