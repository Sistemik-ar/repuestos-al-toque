import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { clearStoreCategories, ensureStore2, seedChosenQuote } from './db';

// Deja a los dos comercios "reciben de todo" para no afectar a otros specs (que asumen feed completo).
test.afterAll(async () => {
  await clearStoreCategories('vendedor@repuestosaltoque.com.ar');
  await clearStoreCategories('e2e-store2@rat.test');
});

// Guardado EN LOTE: la matriz junta los cambios de varios comercios y la savebar los guarda de una.
test('admin/comercios: guarda en lote los rubros de 2 comercios y persisten', async ({ page }) => {
  await ensureStore2(); // hace falta un 2º comercio para probar el lote
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=comercios');
  await expect(page.getByText('Poca cobertura')).toBeVisible({ timeout: 15000 }); // la sección cargó (KPIs de cobertura)

  // tilda "Motor" en ambos comercios (celdas de la matriz; cada celda tiene aria-label "Comercio · Rubro")
  await page.getByRole('button', { name: 'Repuestos Centro · Motor' }).click();
  await page.getByRole('button', { name: 'Repuestos Dos · Motor' }).click();
  await expect(page.getByText(/2 comercios con cambios/i)).toBeVisible(); // savebar cuenta los dos
  await page.getByRole('button', { name: /Guardar todo/i }).click();
  await expect(page.getByText(/Cambios guardados/i)).toBeVisible({ timeout: 10000 });

  // tras recargar, los tildes siguen marcados (se guardaron de verdad)
  await page.reload();
  await expect(page.getByRole('button', { name: 'Repuestos Centro · Motor' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Repuestos Dos · Motor' })).toHaveAttribute('aria-pressed', 'true');
});

// Toggle de vista (Matriz/Lista) persistido en localStorage + "Descartar" revierte los cambios.
test('admin/comercios: alterna vista Matriz/Lista (persiste) y "Descartar" revierte', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=comercios');
  await expect(page.getByText('Poca cobertura')).toBeVisible({ timeout: 15000 });

  // por defecto, vista matriz
  await expect(page.locator('table.matrix')).toBeVisible();
  // a Lista: aparece el acordeón y desaparece la tabla
  await page.getByRole('button', { name: /Lista/i }).click();
  await expect(page.locator('.cm-acc').first()).toBeVisible();
  await expect(page.locator('table.matrix')).toHaveCount(0);
  // persiste tras recargar (localStorage 'cm.view')
  await page.reload();
  await expect(page.locator('.cm-acc').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('table.matrix')).toHaveCount(0);

  // de vuelta a Matriz: tildar una celda muestra la savebar; "Descartar" la revierte
  await page.getByRole('button', { name: /Matriz/i }).click();
  const cell = page.getByRole('button', { name: 'Repuestos Centro · Frenos' });
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/1 comercio con cambios/i)).toBeVisible();
  await page.getByRole('button', { name: /Descartar/i }).click();
  await expect(page.getByText(/Cambios descartados/i)).toBeVisible({ timeout: 10000 });
  await expect(cell).toHaveAttribute('aria-pressed', 'false'); // volvió a destildarse
});

// Cotizaciones desde la matriz (botón por fila) y el modal global "Todas las cotizaciones".
test('admin/comercios: ver cotizaciones por fila (matriz) y "Todas las cotizaciones"', async ({ page }) => {
  const desc = `CotMatriz E2E ${Date.now()}`;
  await seedChosenQuote({ desc }); // cotización del vendedor seed (Repuestos Centro)
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=comercios');
  await expect(page.getByText('Poca cobertura')).toBeVisible({ timeout: 15000 });

  // botón de cotizaciones en la fila de la matriz (icono de tags)
  await page.locator('.cm-row', { hasText: 'Repuestos Centro' }).locator('.cm-cot').click();
  await expect(page.getByRole('heading', { name: /Cotizaciones de Repuestos Centro/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText(desc);
  await page.locator('.modal .icon-btn').click(); // cerrar

  // botón global "Todas las cotizaciones": lista de todos los comercios, mostrando quién cotizó
  await page.getByRole('button', { name: /Todas las cotizaciones/i }).click();
  await expect(page.getByRole('heading', { name: /Todas las cotizaciones/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText(desc);
  await expect(page.locator('.modal')).toContainText('Repuestos Centro');
});

// Ficha consolidada del comercio (drawer): se abre desde la matriz y tiene tabs.
test('admin/comercios: la ficha (drawer) del comercio abre con sus datos y métricas', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=comercios');
  await expect(page.getByText('Poca cobertura')).toBeVisible({ timeout: 15000 });
  await page.locator('.cm-row', { hasText: 'Repuestos Centro' }).locator('.cm-meta').click(); // click en el nombre
  await expect(page.locator('.drawer .dr-name')).toContainText('Repuestos Centro', { timeout: 10000 });
  await page.locator('.dr-tabs').getByRole('button', { name: /Métricas/i }).click();
  await expect(page.locator('.drawer')).toContainText('Cotizó', { timeout: 10000 }); // métrica cargada
});
