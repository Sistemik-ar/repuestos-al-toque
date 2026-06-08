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
