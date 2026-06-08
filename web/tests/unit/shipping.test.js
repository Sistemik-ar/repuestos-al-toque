import { describe, it, expect } from 'vitest';
import { shippingCostFromTariff, haversineKm, MIN_SHIP } from '@/lib/shipping';

const rows = [
  { uptoKm: 1, price: 5000 },
  { uptoKm: 2, price: 5500 },
  { uptoKm: 4, price: 6500 },
  { uptoKm: 7, price: 7800 },
];

describe('shippingCostFromTariff', () => {
  it('mínimo $5000 cuando no hay distancia', () => expect(shippingCostFromTariff(null, rows)).toBe(5000));
  it('mínimo $5000 cuando no hay tabla', () => expect(shippingCostFromTariff(3, [])).toBe(MIN_SHIP));
  it('toma la banda exacta', () => expect(shippingCostFromTariff(2, rows)).toBe(5500));
  it('3km cae en la banda "hasta 4km"', () => expect(shippingCostFromTariff(3, rows)).toBe(6500));
  it('más allá del máximo usa la última banda', () => expect(shippingCostFromTariff(50, rows)).toBe(7800));
  it('nunca por debajo del mínimo aunque la tabla diga menos', () => expect(shippingCostFromTariff(0.5, [{ uptoKm: 1, price: 1000 }])).toBe(5000));
});

describe('haversineKm', () => {
  it('misma coordenada = 0', () => expect(haversineKm({ lat: -41.13, lng: -71.3 }, { lat: -41.13, lng: -71.3 })).toBeCloseTo(0));
  it('distancia Centro→Km5 Bariloche (~5-7 km)', () => {
    const d = haversineKm({ lat: -41.133, lng: -71.310 }, { lat: -41.128, lng: -71.380 });
    expect(d).toBeGreaterThan(4);
    expect(d).toBeLessThan(8);
  });
});
