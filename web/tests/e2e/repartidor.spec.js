import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { seedSale } from './db';

// Pestaña Historial: una entrega concretada del repartidor aparece con su flete.
test('repartidor: el historial muestra una entrega concretada con su flete', async ({ page }) => {
  await seedSale({ riderEmail: 'repartidor@repuestosaltoque.com.ar', desc: `HistRep E2E ${Date.now()}`, freight: 6000 });
  await login(page, 'repartidor@repuestosaltoque.com.ar');
  await page.locator('.rp-tabs').getByRole('button', { name: /Historial/i }).click();
  await expect(page.locator('.hs-card', { hasText: 'Entregas' })).toBeVisible({ timeout: 15000 }); // resumen del historial
  const card = page.locator('.hist-card', { hasText: 'Toyota Corolla' }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText('$6.000'); // flete de la entrega
  // expandir muestra la ruta + chips del detalle
  await card.locator('.hist-head').click();
  await expect(card.locator('.hb-meta')).toBeVisible();
});

// Tabs Activas/Historial alternan la vista.
test('repartidor: alterna entre Activas e Historial', async ({ page }) => {
  await login(page, 'repartidor@repuestosaltoque.com.ar');
  await expect(page.getByRole('heading', { name: 'Entregas', exact: true })).toBeVisible({ timeout: 15000 });
  await page.locator('.rp-tabs').getByRole('button', { name: /Historial/i }).click();
  await expect(page.locator('.hist-toolbar')).toBeVisible({ timeout: 15000 }); // toolbar de historial (período + búsqueda)
  await page.locator('.rp-tabs').getByRole('button', { name: /Activas/i }).click();
  await expect(page.locator('.kpi-row')).toBeVisible(); // KPIs de la vista Activas
});

// Toggle En línea/Desconectado: al desconectarse se ocultan los viajes disponibles.
test('repartidor: desconectarse oculta los viajes disponibles', async ({ page }) => {
  await login(page, 'repartidor@repuestosaltoque.com.ar');
  const pill = page.getByRole('button', { name: /En línea/i });
  await expect(pill).toBeVisible({ timeout: 15000 });
  await pill.click();
  await expect(page.getByRole('button', { name: /Desconectado/i })).toBeVisible();
  await expect(page.getByText(/Estás desconectado/i)).toBeVisible();
});
