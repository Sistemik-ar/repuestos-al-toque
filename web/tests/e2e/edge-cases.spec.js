import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

test('login con campos vacíos muestra error', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page.getByText(/Completá email y contraseña/i)).toBeVisible();
});

test('un trabajo puede tener varios repuestos (seguir comprando)', async ({ browser }) => {
  const stamp = Date.now();
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');

  // ítem 1 + "agregar otro repuesto"
  await crearItem(m, `Multi1 E2E ${stamp}`, plate);
  await m.getByRole('button', { name: /Agregar otro repuesto/i }).click();
  // ítem 2 (mismo auto, sin recargar vehículo)
  await m.locator('text=Frenos').first().click();
  await m.locator('textarea').first().fill(`Multi2 E2E ${stamp}`);
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m.getByText(/2 ítems en este trabajo/i)).toBeVisible({ timeout: 15000 });
  await publicarTrabajo(m);
  await expect(m.getByText(/Multi1 E2E/)).toBeVisible();
  await expect(m.getByText(/Multi2 E2E/)).toBeVisible();

  // el vendedor ve los 2 ítems publicados
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await expect(s.locator('.card', { hasText: `Multi1 E2E ${stamp}` })).toBeVisible({ timeout: 15000 });
  await expect(s.locator('.card', { hasText: `Multi2 E2E ${stamp}` })).toBeVisible();

  await mc.close();
  await sc.close();
});

test('un comercio puede enviar varias opciones para la misma solicitud', async ({ browser }) => {
  const desc = `MultiOpcion E2E ${Date.now()}`;
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, uniquePlate());
  await publicarTrabajo(m);

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const pendCard = s.locator('.card', { hasText: desc });
  await expect(pendCard).toBeVisible({ timeout: 15000 });
  await pendCard.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('45000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();

  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 });
  await s.getByRole('button', { name: /Cotizadas/i }).click();
  const cotCard = s.locator('.card', { hasText: desc });
  await expect(cotCard.getByText(/1 opción/)).toBeVisible();
  await cotCard.getByRole('button', { name: /Agregar otra opción/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('38000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: desc }).getByText(/2 opciones/)).toBeVisible({ timeout: 10000 });

  await mc.close();
  await sc.close();
});
