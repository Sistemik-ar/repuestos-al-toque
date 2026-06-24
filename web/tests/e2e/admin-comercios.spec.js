import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { clearStoreCategories, ensureStore2 } from './db';

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
