import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { seedSale, seedChosenQuote, seedRequest } from './db';

// El filtro por estado separa de verdad concretados de cancelados.
test('admin/pedidos: el filtro por estado separa concretados de cancelados', async ({ page }) => {
  const t = Date.now();
  const sale = await seedSale({ desc: `Filtro Conc ${t}`, part: 30000 }); // DELIVERED
  const canc = await seedRequest({ desc: `Filtro Canc ${t}`, status: 'CANCELLED', quoteStatus: 'SELECTED', selectedAt: true });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(`Filtro `); // matchea ambos

  await page.getByRole('button', { name: /^Concretados$/ }).click();
  await expect(page.locator('tr', { hasText: sale.desc })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('tr', { hasText: canc.desc })).toHaveCount(0);

  await page.getByRole('button', { name: /^Cancelados$/ }).click();
  await expect(page.locator('tr', { hasText: canc.desc })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('tr', { hasText: sale.desc })).toHaveCount(0);
});

// Línea de tiempo de un pedido elegido pero sin pagar: ciclo temprano + "esperando pago", sin reparto.
test('admin/pedidos: timeline de un elegido-sin-pagar (sin eventos de reparto)', async ({ page }) => {
  const r = await seedRequest({ desc: `TL Closed ${Date.now()}`, status: 'CLOSED', quoteStatus: 'SELECTED', selectedAt: true });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(r.desc);
  const row = page.locator('tr', { hasText: r.desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.locator('td[data-label="Estado"]')).toContainText('Elegido'); // "Elegido · sin pagar"
  await row.locator('td[data-label="Línea de tiempo"] button').click();
  const modal = page.locator('.modal');
  await expect(page.getByRole('heading', { name: /Línea de tiempo/i })).toBeVisible({ timeout: 10000 });
  await expect(modal).toContainText('Pedido publicado');
  await expect(modal).toContainText('Eligió una cotización');
  await expect(modal).toContainText('Esperando pago');
  await expect(modal).not.toContainText('Entregado'); // no se concretó -> sin reparto
});

// Línea de tiempo de un cancelado.
test('admin/pedidos: timeline de un cancelado', async ({ page }) => {
  const r = await seedRequest({ desc: `TL Canc ${Date.now()}`, status: 'CANCELLED', quoteStatus: 'SELECTED', selectedAt: true });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(r.desc);
  const row = page.locator('tr', { hasText: r.desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Línea de tiempo"] button').click();
  await expect(page.getByRole('heading', { name: /Línea de tiempo/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText('Cancelado');
});

// Tiempo de respuesta real (no "al toque"): cotización ~45 min después de publicado.
test('admin/pedidos: muestra el tiempo de respuesta real de la cotización', async ({ page }) => {
  const r = await seedRequest({ desc: `RespTime ${Date.now()}`, status: 'QUOTED', requestAgoMin: 45, quoteAgoMin: 0 });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(r.desc);
  const row = page.locator('tr', { hasText: r.desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Cotizaciones"] button').click();
  await expect(page.getByRole('heading', { name: /Cotizaciones recibidas/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText(/cotizó en 4\d min/); // ~45 min
});

// El drawer del comercio: tab Cotizaciones (con datos) y tab Rubros.
test('admin/comercios: el drawer muestra las cotizaciones y los rubros del comercio', async ({ page }) => {
  const desc = `DrawerCot ${Date.now()}`;
  await seedChosenQuote({ desc }); // cotización de Repuestos Centro
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=comercios');
  await expect(page.getByText('Poca cobertura')).toBeVisible({ timeout: 15000 });
  await page.locator('.cm-row', { hasText: 'Repuestos Centro' }).locator('.cm-meta').click();
  await expect(page.locator('.drawer .dr-name')).toContainText('Repuestos Centro', { timeout: 10000 });
  await page.locator('.dr-tabs').getByRole('button', { name: /Cotizaciones/i }).click();
  await expect(page.locator('.drawer')).toContainText(desc); // la cotización aparece
  await page.locator('.dr-tabs').getByRole('button', { name: /Rubros/i }).click();
  await expect(page.locator('.drawer')).toContainText(/rubros|Recibe de todos/i); // estado de rubros
});
