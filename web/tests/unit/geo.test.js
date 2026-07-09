import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocode, inZone, zoneOf, searchInZones } from '@/lib/geo';

afterEach(() => vi.restoreAllMocks());

// mismo box que DEFAULT_ZONES de lib/zones.js (acá inline para no arrastrar el import de prisma)
const BARILOCHE = { id: 1, slug: 'bariloche', name: 'Bariloche', latMin: -41.30, latMax: -40.95, lngMin: -71.70, lngMax: -71.05, active: true, deliveryEnabled: true, storesEnabled: true };
const BOLSON = { id: 2, slug: 'el-bolson', name: 'El Bolsón', latMin: -42.05, latMax: -41.85, lngMin: -71.65, lngMax: -71.40, active: true, deliveryEnabled: false, storesEnabled: false };

describe('inZone / zoneOf (solo damos de alta direcciones dentro de una zona habilitada)', () => {
  it('acepta el centro de Bariloche', () => {
    expect(inZone({ lat: -41.133, lng: -71.31 }, BARILOCHE)).toBe(true);
  });
  it('acepta el Km de Av. Bustillo (oeste)', () => {
    expect(inZone({ lat: -41.13, lng: -71.54 }, BARILOCHE)).toBe(true);
  });
  it('rechaza Buenos Aires', () => {
    expect(inZone({ lat: -34.6, lng: -58.38 }, BARILOCHE)).toBe(false);
  });
  it('rechaza coords nulas/indefinidas', () => {
    expect(inZone(null, BARILOCHE)).toBe(false);
    expect(inZone(undefined, BARILOCHE)).toBe(false);
  });
  it('zoneOf devuelve la zona que contiene el punto (El Bolsón)', () => {
    const z = zoneOf({ lat: -41.96, lng: -71.53 }, [BARILOCHE, BOLSON]);
    expect(z?.slug).toBe('el-bolson');
  });
  it('zoneOf devuelve null fuera de toda zona (Neuquén capital)', () => {
    expect(zoneOf({ lat: -38.95, lng: -68.06 }, [BARILOCHE, BOLSON])).toBeNull();
  });
});

describe('searchInZones (Nominatim, una consulta por zona)', () => {
  it('etiqueta cada candidato con su zona y filtra lo que cae fuera del box', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { display_name: 'Mitre 100, Bariloche', lat: '-41.133', lon: '-71.310' },
        { display_name: 'Otro lado, CABA', lat: '-34.6', lon: '-58.38' }, // fuera del box -> se descarta
      ],
    });
    const res = await searchInZones('Mitre 100', [BARILOCHE]);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ lat: -41.133, lng: -71.31, zone: 'bariloche' });
  });
  it('consulta una vez por zona y junta los resultados', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    await searchInZones('San Martín 100', [BARILOCHE, BOLSON]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('sin zonas o consulta corta devuelve vacío sin llamar a la red', async () => {
    global.fetch = vi.fn();
    expect(await searchInZones('ab', [BARILOCHE])).toEqual([]);
    expect(await searchInZones('San Martín 100', [])).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
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
