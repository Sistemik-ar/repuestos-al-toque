import { test, expect } from '@playwright/test';
import { login } from '../e2e/helpers';

// Smoke read-only contra staging real: solo loguea con las cuentas seed y verifica que cargan las
// vistas clave (incluidas las de hoy: filtro de pedidos, ficha de comercio, Cobros/split). No muta datos.
const SHOT = process.env.SHOT_DIR || '/tmp';

test('staging: la landing responde', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
});

test('staging: admin entra y ve Pedidos (filtro), Comercios y Cobros', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await expect(page).toHaveURL(/\/admin/);

  await page.goto('/admin?sec=pedidos');
  await expect(page.getByRole('heading', { name: /Últimos pedidos/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Concretados$/ })).toBeVisible(); // filtro por estado (hoy)
  await page.screenshot({ path: `${SHOT}/stg-admin-pedidos.png`, fullPage: true });

  await page.goto('/admin?sec=comercios');
  await expect(page.getByRole('button', { name: /Todas las cotizaciones/i })).toBeVisible(); // sección de comercios cargada
  await page.screenshot({ path: `${SHOT}/stg-admin-comercios.png`, fullPage: true });

  await page.goto('/admin?sec=cobros'); // split (solo staging)
  await expect(page.locator('h1, h2').filter({ hasText: /Cobros/i }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOT}/stg-admin-cobros.png`, fullPage: true });
});

// Con los datos demo (db:demo) sembrados en Neon: ejercita de verdad los modales nuevos.
test('staging: cotizaciones del pedido (tiempos de respuesta + sin stock + no respondieron)', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await expect(page.getByRole('heading', { name: /Últimos pedidos/i })).toBeVisible();
  await page.getByPlaceholder(/Buscar mec/i).fill('Kit de embrague'); // pedido COTIZADO del demo
  const fila = page.locator('tr', { hasText: 'Kit de embrague' }).first();
  await expect(fila).toBeVisible();
  await fila.locator('td[data-label="Cotizaciones"] button').click();
  await expect(page.getByRole('heading', { name: /Cotizaciones recibidas/i })).toBeVisible();
  const modal = page.locator('.modal');
  await expect(modal).toContainText('Andina Parts');        // comercio que cotizó
  await expect(modal).toContainText('cotizó en');            // tiempo de respuesta real
  await expect(modal).toContainText(/Marcaron sin stock/i);  // sección sin stock
  await page.screenshot({ path: `${SHOT}/stg-cotizaciones.png`, fullPage: true });
});

test('staging: línea de tiempo de un pedido entregado (ciclo completo + reparto)', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill('Disco de freno'); // pedido ENTREGADO del demo
  const fila = page.locator('tr', { hasText: 'Disco de freno' }).first();
  await expect(fila).toBeVisible();
  await fila.locator('td[data-label="Línea de tiempo"] button').click();
  await expect(page.getByRole('heading', { name: /Línea de tiempo/i })).toBeVisible();
  await expect(page.locator('.modal')).toContainText('Pedido publicado');
  await expect(page.locator('.modal')).toContainText('Entregado'); // evento de reparto concretado
  await page.screenshot({ path: `${SHOT}/stg-timeline.png`, fullPage: true });
});

// Comprobantes del split con datos demo: el admin ve el desglose FULL + cómo se divide.
test('staging: comprobante del admin (desglose full + cómo se divide el split)', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill('Disco de freno'); // pedido ENTREGADO del demo
  const row = page.locator('tr', { hasText: 'Disco de freno' }).first();
  await expect(row).toBeVisible();
  await row.locator('td[data-label="Total"] button').click();
  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Comprobante de pago/i })).toBeVisible();
  await expect(modal.getByText(/Total cobrado/)).toBeVisible();
  await expect(modal.getByRole('heading', { name: /Cómo se divide \(split MP\)/i })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/stg-comprobante-admin.png`, fullPage: true });
});

// Comprobante del lado del comercio (vendedor): venta concretada.
test('staging: comprobante del comercio (venta concretada)', async ({ page }) => {
  await login(page, 'vendedor@repuestosaltoque.com.ar');
  await page.getByRole('button', { name: /Concretad/i }).click();
  const card = page.locator('.card', { hasText: 'Disco de freno' }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Comprobante de pago/i })).toBeVisible();
  await expect(modal.getByText(/Monto del repuesto/i)).toBeVisible();
  await page.screenshot({ path: `${SHOT}/stg-comprobante-comercio.png`, fullPage: true });
});

test('staging: el mecánico entra a su panel', async ({ page }) => {
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  await expect(page).toHaveURL(/\/mecanico/);
  await page.screenshot({ path: `${SHOT}/stg-mecanico.png`, fullPage: true });
});

test('staging: el comercio entra a su panel', async ({ page }) => {
  await login(page, 'vendedor@repuestosaltoque.com.ar');
  await expect(page).toHaveURL(/\/comercio/);
  await page.screenshot({ path: `${SHOT}/stg-comercio.png`, fullPage: true });
});

test('staging: el repartidor entra a su panel', async ({ page }) => {
  await login(page, 'repartidor@repuestosaltoque.com.ar');
  await expect(page).toHaveURL(/\/repartidor/);
  await page.screenshot({ path: `${SHOT}/stg-repartidor.png`, fullPage: true });
});
