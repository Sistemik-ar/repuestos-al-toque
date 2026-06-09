import { describe, it, expect } from 'vitest';
import { creditActive, creditStatus } from '@/lib/credit';

describe('creditActive (doble aprobación)', () => {
  it('activa solo con admin Y comercio aprobados', () => {
    expect(creditActive('APPROVED', 'APPROVED', null)).toBe(true);
  });
  it('no activa si falta una aprobación', () => {
    expect(creditActive('APPROVED', 'PENDING', null)).toBe(false);
    expect(creditActive('PENDING', 'APPROVED', null)).toBe(false);
  });
  it('no activa si está desactivada', () => {
    expect(creditActive('APPROVED', 'APPROVED', new Date())).toBe(false);
  });
});

describe('creditStatus', () => {
  it('PENDING cuando aún no resolvieron', () => {
    expect(creditStatus({ adminStatus: 'PENDING', storeStatus: 'PENDING', active: false })).toBe('PENDING');
  });
  it('ACTIVE cuando active=true', () => {
    expect(creditStatus({ adminStatus: 'APPROVED', storeStatus: 'APPROVED', active: true })).toBe('ACTIVE');
  });
  it('REJECTED si alguno rechazó', () => {
    expect(creditStatus({ adminStatus: 'PENDING', storeStatus: 'REJECTED', active: false })).toBe('REJECTED');
  });
  it('DISABLED tiene prioridad', () => {
    expect(creditStatus({ adminStatus: 'APPROVED', storeStatus: 'APPROVED', active: true, disabledAt: new Date() })).toBe('DISABLED');
  });
});
