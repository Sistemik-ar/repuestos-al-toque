import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { seedSale, seedChosenQuote, ensureStore2, seedDismissal } from './db';

// Desglose congelado de un pedido (modal del admin): comisión %, envío y recargo MP.
test('admin: el desglose de un pedido muestra comisión %, envío y recargo MP', async ({ page }) => {
  const { desc } = await seedSale({ desc: `Desglose E2E ${Date.now()}`, part: 50000, commissionPct: 10, freight: 7000, mpFee: 3000 });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(desc);
  const row = page.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Total"] button').click(); // el Total abre el comprobante
  await expect(page.getByRole('heading', { name: /Comprobante de pago/i })).toBeVisible();
  await expect(page.getByText(/Medio de pago/i)).toBeVisible(); // bloque de pago del comprobante
  await expect(page.getByText(/Vendido por/i)).toBeVisible(); // comercio que vendió
  await expect(page.locator('.modal')).toContainText('Repuestos Centro'); // nombre del comercio vendedor
  await expect(page.getByText(/Comisión \(10%\)/)).toBeVisible();
  await expect(page.getByText('$5.000')).toBeVisible(); // comisión = 10% de 50.000
  await expect(page.getByText(/Recargo Mercado Pago/i)).toBeVisible();
  await expect(page.getByText('$3.000')).toBeVisible(); // recargo MP congelado
});

// Estadísticas por mecánico y por repartidor: la venta sembrada aparece en cada tabla.
test('admin: estadísticas por mecánico y por repartidor muestran la venta', async ({ page }) => {
  await seedSale({ riderEmail: 'repartidor@repuestosaltoque.com.ar', desc: `Stats E2E ${Date.now()}`, part: 40000, freight: 6000 });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=stats');
  await page.locator('.pill-tabs').getByRole('button', { name: 'Mecánicos' }).click();
  await expect(page.getByRole('heading', { name: 'Por mecánico' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Taller Patagonia').first()).toBeVisible(); // mecánico seed
  await page.locator('.pill-tabs').getByRole('button', { name: 'Repartidores' }).click();
  await expect(page.getByRole('heading', { name: 'Por repartidor' })).toBeVisible();
  await expect(page.getByText('Diego R.').first()).toBeVisible(); // repartidor seed
});

// "Últ. ingreso" (lastLoginAt) se puebla cuando el usuario inicia sesión.
test('admin: "Últ. ingreso" se puebla tras el login del comercio', async ({ page, browser }) => {
  await seedSale({ desc: `UltIng E2E ${Date.now()}` }); // venta del vendedor seed -> fila en stats "Por comercio"
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar'); // registra lastLoginAt
  await sc.close();
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=stats');
  await page.locator('.pill-tabs').getByRole('button', { name: 'Comercios' }).click();
  await expect(page.getByRole('heading', { name: 'Por comercio' })).toBeVisible({ timeout: 15000 });
  const row = page.locator('tr', { hasText: 'Repuestos Centro' }).first();
  await expect(row.locator('td[data-label="Últ. ingreso"]')).not.toHaveText('—', { timeout: 10000 });
});

// Editar un usuario desde el backoffice guarda los cambios.
test('admin: editar un usuario guarda los cambios', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=usuarios'); // el default ahora es "Inicio"
  // editamos al mecánico (no tiene docsOk y no le tocamos el nombre): no afecta a otros tests que
  // comparten la DB. (Editar al repartidor recalcularía docsOk=false y lo dejaría sin poder tomar viajes.)
  await page.getByPlaceholder(/Buscar por nombre/i).fill('Patagonia'); // Taller Patagonia (mecánico seed)
  const row = page.locator('tr', { hasText: 'Patagonia' }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: /Editar/i }).click();
  await expect(page.getByRole('heading', { name: /Editar usuario/i })).toBeVisible({ timeout: 10000 });
  await page.locator('.modal .field', { hasText: 'WhatsApp' }).locator('input').fill(`11${Date.now() % 100000000}`);
  await page.getByRole('button', { name: /Guardar cambios/i }).click();
  await expect(page.getByText(/Usuario actualizado/i)).toBeVisible({ timeout: 10000 });
});

// El admin puede ver las cotizaciones que hizo un comercio.
test('admin: ve las cotizaciones de un comercio', async ({ page }) => {
  const desc = `QStore E2E ${Date.now()}`;
  await seedChosenQuote({ desc }); // cotización del vendedor seed (Repuestos Centro)
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=comercios');
  await page.getByPlaceholder(/Buscar comercio/i).fill('Repuestos Centro');
  await page.getByRole('button', { name: /Lista/i }).click(); // "Ver cotizaciones" vive en el acordeón de la vista Lista
  const acc = page.locator('.cm-acc', { hasText: 'Repuestos Centro' });
  await expect(acc).toBeVisible({ timeout: 10000 });
  await acc.locator('.cm-acc-head').click(); // expandir el comercio
  await acc.getByRole('button', { name: /Ver cotizaciones/i }).click();
  await expect(page.getByRole('heading', { name: /Cotizaciones de Repuestos Centro/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText(desc); // el pedido cotizado aparece en el modal
});

// Desde el listado de pedidos, el admin ve TODAS las cotizaciones que recibió ese pedido
// (comercio, precio, estado y cuándo cotizó).
test('admin: ve las cotizaciones que recibió un pedido (+ quién marcó sin stock)', async ({ page }) => {
  const { desc, requestId } = await seedSale({ desc: `CotsPedido E2E ${Date.now()}`, part: 50000 }); // venta seed (1 cotización SELECTED)
  await ensureStore2();
  await seedDismissal(requestId, 'e2e-store2@rat.test'); // Repuestos Dos marcó "sin stock"
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(desc);
  const row = page.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Cotizaciones"] button').click();
  await expect(page.getByRole('heading', { name: /Cotizaciones recibidas/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText('Repuestos Centro'); // nombre del comercio que cotizó
  await expect(page.locator('.modal')).toContainText('Elegida'); // estado de la cotización (SELECTED)
  await expect(page.getByRole('heading', { name: /Marcaron sin stock/i })).toBeVisible(); // sección sin stock
  await expect(page.locator('.modal')).toContainText('Repuestos Dos'); // comercio que marcó sin stock
});

// Filtro por estado + estado legible/coloreado en el listado.
test('admin/pedidos: filtro por estado muestra el pedido como "Entregado"', async ({ page }) => {
  await seedSale({ desc: `FiltroEstado E2E ${Date.now()}`, part: 30000 }); // venta DELIVERED
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByRole('button', { name: /^Concretados$/ }).click(); // filtro por estado
  await page.getByPlaceholder(/Buscar mec/i).fill('FiltroEstado');
  const row = page.locator('tr', { hasText: 'FiltroEstado' });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.locator('td[data-label="Estado"]')).toContainText('Entregado'); // estado legible (no el crudo DELIVERED)
});

// El modal del pedido lista los comercios elegibles que NO respondieron.
test('admin/pedidos: el modal muestra los comercios que no respondieron', async ({ page }) => {
  const { desc } = await seedSale({ desc: `NoResp E2E ${Date.now()}`, part: 40000 }); // Repuestos Centro cotizó
  await ensureStore2(); // Repuestos Dos: recibe de todos los rubros y no responde
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(desc);
  const row = page.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Cotizaciones"] button').click();
  await expect(page.getByRole('heading', { name: /No respondieron/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText('Repuestos Dos'); // elegible que no respondió
});
