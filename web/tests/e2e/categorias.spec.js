import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { clearStoreCategories } from './db';

// Deja al comercio en "ve todas las categorías" para no afectar a los demás specs (que usan Frenos).
test.afterAll(async () => { await clearStoreCategories(); });

test('el comercio solo recibe pedidos de los rubros que le asignó el admin', async ({ browser }) => {
  test.setTimeout(120000);
  const desc = `Cat E2E ${Date.now()}`; // crearItem usa la categoría "Frenos"
  const plate = uniquePlate();

  // 1) ADMIN: al comercio "Repuestos Centro" le deja SOLO "Motor" (no Frenos)
  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  await a.getByRole('button', { name: /Comercios/i }).click(); // tab Comercios
  await a.getByPlaceholder(/Buscar comercio/i).fill('Repuestos Centro'); // filtra la grilla paginada
  const row = a.locator('.rat-store-card', { hasText: 'Repuestos Centro' });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: /^✓?\s*Motor$/ }).click(); // tildar Motor
  await row.getByRole('button', { name: /Guardar/i }).click();
  await expect(a.getByText(/Rubros guardados/i)).toBeVisible({ timeout: 10000 });

  // 2) MECÁNICO: crea un pedido de FRENOS y lo publica
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  // 3) VENDEDOR: NO debe ver el pedido de Frenos (solo vende Motor)
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await s.waitForTimeout(5000); // que el dashboard cargue/pollee al menos una vez
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0);

  // 4) ADMIN: ahora le agrega "Frenos" también
  await a.bringToFront();
  await row.getByRole('button', { name: /^✓?\s*Frenos$/ }).click(); // tildar Frenos
  await row.getByRole('button', { name: /Guardar/i }).click();
  await expect(a.getByText(/Rubros guardados/i)).toBeVisible({ timeout: 10000 });

  // 5) VENDEDOR: ahora SÍ lo ve
  await s.bringToFront();
  await s.reload();
  await expect(s.locator('.card', { hasText: desc })).toBeVisible({ timeout: 15000 });

  await ac.close(); await mc.close(); await sc.close();
});
