import { test, expect } from '@playwright/test';

// Smoke de la demo estática (no necesita base de datos).
test.describe('Demo', () => {
  test('/demo entra al login y navega como Mecánico (rol por defecto)', async ({ page }) => {
    await page.goto('/demo');
    await expect(page.locator('.role-opt[data-role="mecanico"]')).toBeVisible();
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/mecanico-dashboard\.html/);
    await expect(page.locator('body')).toContainText(/Solicitar|Pedido|Cotiza/i);
  });

  test('/demo permite elegir el rol Comercio', async ({ page }) => {
    await page.goto('/demo');
    await page.locator('.role-opt[data-role="comercio"]').click();
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page).toHaveURL(/comercio\.html/);
  });
});
