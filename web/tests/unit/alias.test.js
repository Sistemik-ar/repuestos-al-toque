import { describe, it, expect } from 'vitest';
import { aliasLabel } from '@/lib/alias';

describe('aliasLabel', () => {
  it('numera por orden de llegada: A, B, C...', () => {
    expect(aliasLabel(0)).toBe('Proveedor A');
    expect(aliasLabel(1)).toBe('Proveedor B');
    expect(aliasLabel(2)).toBe('Proveedor C');
  });

  it('cada índice da una etiqueta única (sin colisiones en una solicitud)', () => {
    const labels = Array.from({ length: 20 }, (_, i) => aliasLabel(i));
    expect(new Set(labels).size).toBe(20);
  });

  it('después de la Z cicla con sufijo numérico', () => {
    expect(aliasLabel(25)).toBe('Proveedor Z');
    expect(aliasLabel(26)).toBe('Proveedor A1');
    expect(aliasLabel(27)).toBe('Proveedor B1');
  });
});
