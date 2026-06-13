import { describe, it, expect } from 'vitest';
import { mapsDirUrl } from '@/lib/maps';

describe('mapsDirUrl (link "cómo llegar" del repartidor)', () => {
  it('usa coordenadas exactas en modo navegación cuando existen', () => {
    expect(mapsDirUrl({ lat: -41.133, lng: -71.31, address: 'Mitre 100' }))
      .toBe('https://www.google.com/maps/dir/?api=1&destination=-41.133,-71.31');
  });

  it('cae al texto de la dirección si no hay coordenadas', () => {
    const url = mapsDirUrl({ address: 'Av. Bustillo 1240', barrio: 'Km 1' });
    expect(url).toContain('/maps/dir/?api=1&destination=');
    expect(url).toContain(encodeURIComponent('Av. Bustillo 1240 Km 1 Bariloche'));
  });

  it('devuelve null sin punto o sin datos', () => {
    expect(mapsDirUrl(null)).toBeNull();
    expect(mapsDirUrl({})).toBeNull();
  });

  it('lat/lng = 0 se consideran válidas (no las descarta)', () => {
    expect(mapsDirUrl({ lat: 0, lng: 0 })).toBe('https://www.google.com/maps/dir/?api=1&destination=0,0');
  });
});
