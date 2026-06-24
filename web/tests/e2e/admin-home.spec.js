import { test, expect } from '@playwright/test';
import { login } from './helpers';

// La vista "Inicio" (default del admin): KPIs del día, "Necesitan tu atención", top comercios y
// gráfico. Los deep-links cambian de sección ("Ver todos" → Comercios).
test('admin/inicio: dashboard con KPIs, atención y top; "Ver todos" lleva a Comercios', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar'); // Inicio es la sección por defecto
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('GMV (hoy)')).toBeVisible({ timeout: 15000 }); // tarjeta KPI
  await expect(page.getByText(/Necesitan tu atención/i)).toBeVisible();
  await expect(page.getByText(/Top comercios/i)).toBeVisible();
  await expect(page.getByText(/Ventas de hoy por hora/i)).toBeVisible();

  // "Ver todos" del panel Top comercios navega a la sección Comercios
  await page.getByRole('button', { name: /Ver todos/i }).click();
  await expect(page.getByText('Poca cobertura')).toBeVisible({ timeout: 15000 }); // la matriz de Comercios cargó
});
