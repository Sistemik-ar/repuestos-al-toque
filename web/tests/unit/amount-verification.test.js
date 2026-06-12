import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { paidCoversExpected } from '@/lib/orders';

// Verificación de monto: el pago real (transaction_amount de MP) debe cubrir lo esperado
// antes de confirmar una orden. Evita confirmar un pago manipulado por menos plata.
describe('paidCoversExpected', () => {
  const prev = { amt: process.env.MP_TEST_AMOUNT, tok: process.env.MP_TEST_ACCESS_TOKEN };
  beforeEach(() => { delete process.env.MP_TEST_AMOUNT; delete process.env.MP_TEST_ACCESS_TOKEN; });
  afterEach(() => {
    if (prev.amt === undefined) delete process.env.MP_TEST_AMOUNT; else process.env.MP_TEST_AMOUNT = prev.amt;
    if (prev.tok === undefined) delete process.env.MP_TEST_ACCESS_TOKEN; else process.env.MP_TEST_ACCESS_TOKEN = prev.tok;
  });

  it('rechaza un sub-pago grosero (pagar $10 por algo de $50.000)', () => {
    expect(paidCoversExpected(10, 50000)).toBe(false);
  });

  it('acepta el monto exacto', () => {
    expect(paidCoversExpected(50000, 50000)).toBe(true);
  });

  it('tolera variación de envío/redondeo hasta 10% (paga un poco menos)', () => {
    expect(paidCoversExpected(48000, 50000)).toBe(true); // -4%
    expect(paidCoversExpected(44000, 50000)).toBe(false); // -12%, sospechoso
  });

  it('un pago de más nunca se rechaza', () => {
    expect(paidCoversExpected(60000, 50000)).toBe(true);
  });

  it('sin dato de monto (legacy/null) no bloquea', () => {
    expect(paidCoversExpected(null, 50000)).toBe(true);
    expect(paidCoversExpected(undefined, 50000)).toBe(true);
  });

  it('en modo prueba (MP_TEST_AMOUNT) no compara montos', () => {
    process.env.MP_TEST_AMOUNT = '10';
    expect(paidCoversExpected(10, 50000)).toBe(true);
  });
});
