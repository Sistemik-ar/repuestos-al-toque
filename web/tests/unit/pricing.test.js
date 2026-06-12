import { describe, it, expect } from 'vitest';
import { computePricing } from '@/lib/orders';

describe('computePricing', () => {
  it('comisión 5% sin recargo MP', () => {
    const p = computePricing(40000, 5000, { commissionPct: 5, mpFeePct: 6.39, mpFeeEnabled: false });
    expect(p.commission).toBe(2000);
    expect(p.mpFeeAmount).toBe(0);
    expect(p.total).toBe(47000); // 40000 + 2000 + 5000
  });

  it('comisión 10% con recargo MP del 6,39% sumado al total', () => {
    const p = computePricing(40000, 5000, { commissionPct: 10, mpFeePct: 6.39, mpFeeEnabled: true });
    expect(p.commission).toBe(4000);
    const sub = 40000 + 4000 + 5000; // 49000
    expect(p.mpFeeAmount).toBe(Math.round(sub * 0.0639)); // 3131
    expect(p.total).toBe(sub + p.mpFeeAmount);
  });

  it('cuenta corriente: no cobra el repuesto, solo comisión + envío (+ recargo)', () => {
    const p = computePricing(40000, 5000, { commissionPct: 10, mpFeePct: 6.39, mpFeeEnabled: false }, true);
    expect(p.creditAccount).toBe(true);
    expect(p.commission).toBe(4000);
    expect(p.total).toBe(4000 + 5000); // sin el repuesto
  });
});

describe('computePricing — casos borde', () => {
  it('comisión 0% -> sin comisión', () => {
    const p = computePricing(10000, 5000, { commissionPct: 0, mpFeePct: 6.39, mpFeeEnabled: false });
    expect(p.commission).toBe(0);
    expect(p.total).toBe(15000);
  });
  it('recargo MP activado pero 0% -> sin recargo', () => {
    const p = computePricing(10000, 5000, { commissionPct: 10, mpFeePct: 0, mpFeeEnabled: true });
    expect(p.mpFeeAmount).toBe(0);
    expect(p.total).toBe(16000);
  });
  it('cuenta corriente + recargo: el recargo va sobre comisión+envío, no el repuesto', () => {
    const p = computePricing(40000, 5000, { commissionPct: 10, mpFeePct: 10, mpFeeEnabled: true }, true);
    expect(p.commission).toBe(4000);
    expect(p.mpFeeAmount).toBe(900); // 10% de (4000+5000)
    expect(p.total).toBe(9900);
  });
  it('redondea la comisión', () => {
    const p = computePricing(9999, 0, { commissionPct: 5, mpFeePct: 0, mpFeeEnabled: false });
    expect(p.commission).toBe(500); // round(499.95)
  });
});

import { parsePrice } from '@/lib/money';
describe('parsePrice (entrada manual del vendedor)', () => {
  it('formatos comunes', () => {
    expect(parsePrice('45000')).toBe(45000);
    expect(parsePrice('45.000')).toBe(45000);
    expect(parsePrice('$ 45.000')).toBe(45000);
    expect(parsePrice('45.000,50')).toBe(45001);
    expect(parsePrice('1500.50')).toBe(1501); // antes daba 150050
    expect(parsePrice('1,500.50')).toBe(1501);
  });
  it('basura -> 0 (rechazado por la validación)', () => {
    expect(parsePrice('')).toBe(0);
    expect(parsePrice('abc')).toBe(0);
    expect(parsePrice('-5')).toBe(0);
  });
});
