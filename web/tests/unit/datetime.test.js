import { describe, it, expect } from 'vitest';
import { fmtDateTime } from '@/lib/ui';

// Fecha/hora siempre en UTC-3 (Bariloche/Argentina, sin DST), formato dd/mm/aaaa hh:mm,
// independiente del huso del dispositivo que corre el test.
describe('fmtDateTime', () => {
  it('formatea un epoch UTC a hora de Argentina (UTC-3)', () => {
    // 16/06/2026 17:05 UTC -> 14:05 en UTC-3
    expect(fmtDateTime(Date.UTC(2026, 5, 16, 17, 5, 0))).toBe('16/06/2026 14:05');
  });

  it('cruza bien el día/año al restar 3 horas', () => {
    // 01/01/2026 01:30 UTC -> 31/12/2025 22:30 en UTC-3
    expect(fmtDateTime(Date.UTC(2026, 0, 1, 1, 30, 0))).toBe('31/12/2025 22:30');
  });

  it('rellena con cero (2 dígitos) día, mes, hora y minuto', () => {
    // 05/03/2026 12:09 UTC -> 09:09 en UTC-3
    expect(fmtDateTime(Date.UTC(2026, 2, 5, 12, 9, 0))).toBe('05/03/2026 09:09');
  });

  it('acepta Date además de epoch ms', () => {
    expect(fmtDateTime(new Date(Date.UTC(2026, 5, 16, 17, 5, 0)))).toBe('16/06/2026 14:05');
  });

  it('devuelve "—" para valores vacíos o inválidos', () => {
    expect(fmtDateTime(null)).toBe('—');
    expect(fmtDateTime('')).toBe('—');
    expect(fmtDateTime(undefined)).toBe('—');
    expect(fmtDateTime(NaN)).toBe('—');
  });
});
