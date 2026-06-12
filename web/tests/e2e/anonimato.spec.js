import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

// La regla central del producto: nadie ve la identidad del otro durante la cotización.
test('anonimato: el mecánico no ve el nombre del comercio y el comercio no ve el del taller', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `Anonimo E2E ${Date.now()}`;

  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, uniquePlate());
  await publicarTrabajo(m);

  // VENDEDOR: ve la solicitud pero NUNCA el nombre del taller
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText(/Mecánico anónimo/i);
  // la identidad del taller NO aparece en la solicitud (sí puede aparecer en la sección de
  // Cuenta Corriente, donde la relación es explícita por diseño)
  await expect(card).not.toContainText('Taller Patagonia');
  await expect(s.locator('.cards-grid')).not.toContainText('Taller Patagonia');
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('30000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 });

  // MECÁNICO: ve la cotización con ALIAS, nunca el nombre real del comercio
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await expect(m.getByText(/Proveedor [A-Z]/).first()).toBeVisible(); // alias rotativo (A/B/C…)
  await expect(m.locator('body')).not.toContainText('Repuestos Centro'); // identidad real del vendedor
  await expect(m.getByText(/Anónimo hasta concretar/i).first()).toBeVisible();

  await mc.close(); await sc.close();
});
