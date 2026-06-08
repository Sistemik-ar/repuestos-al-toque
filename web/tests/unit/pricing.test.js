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
