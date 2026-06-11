import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

const toNum = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);

// El total del link del trabajo = repuestos + comisión + envío (todos los subítems).
test('el total del pago del trabajo = suma de repuesto + comisión + envío', async ({ browser }) => {
  const desc = `Monto E2E ${Date.now()}`;
  const PRICE = 45000;

  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, uniquePlate());
  await publicarTrabajo(m);

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill(String(PRICE));
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 }); // cotización confirmada

  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 }); // ventana cerrada efectiva
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();

  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  await m.getByRole('button', { name: /Generar link de pago/i }).click();
  const pagoCard = m.locator('.card', { hasText: 'Pago del trabajo' });
  await expect(pagoCard.getByText(/Total/)).toBeVisible({ timeout: 20000 });

  const text = await pagoCard.innerText();
  const montos = [...text.matchAll(/\$\s?([\d.]+)/g)].map((x) => toNum(x[1]));
  expect(montos.length).toBeGreaterThanOrEqual(4); // repuestos, comisión, envío, total
  const total = montos[montos.length - 1];
  const suma = montos.slice(0, -1).reduce((a, b) => a + b, 0);
  expect(montos[0]).toBe(PRICE);
  expect(suma).toBe(total);

  await mc.close();
  await sc.close();
});
