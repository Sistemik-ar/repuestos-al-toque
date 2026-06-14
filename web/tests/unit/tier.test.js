import { describe, it, expect } from 'vitest';
import { tierFor } from '@/lib/ui';

// Niveles de reputación: a más operaciones concretadas, mejor insignia. Se elige el tier más alto
// cuyo umbral (min) ya alcanzó. La UI lo usa para mostrar el badge en mecánico/comercio.
describe('tierFor', () => {
  it('mecánico: arranca "Nuevo" y sube por umbrales (0/10/50/100)', () => {
    expect(tierFor('mechanic', 0).label).toBe('Mecánico Nuevo');
    expect(tierFor('mechanic', 9).label).toBe('Mecánico Nuevo');
    expect(tierFor('mechanic', 10).label).toBe('Mecánico Activo');
    expect(tierFor('mechanic', 49).label).toBe('Mecánico Activo');
    expect(tierFor('mechanic', 50).label).toBe('Mecánico Pro');
    expect(tierFor('mechanic', 100).label).toBe('Mecánico Elite');
    expect(tierFor('mechanic', 9999).label).toBe('Mecánico Elite'); // no se pasa del tope
  });

  it('comercio: umbrales propios (0/25/100/250)', () => {
    expect(tierFor('store', 0).label).toBe('Vendedor Nuevo');
    expect(tierFor('store', 24).label).toBe('Vendedor Nuevo');
    expect(tierFor('store', 25).label).toBe('Vendedor Confiable');
    expect(tierFor('store', 100).label).toBe('Vendedor Destacado');
    expect(tierFor('store', 250).label).toBe('Top Vendedor');
  });

  it('rol desconocido cae al esquema de mecánico (default), no rompe', () => {
    expect(tierFor('loquesea', 0).label).toBe('Mecánico Nuevo');
  });
});
