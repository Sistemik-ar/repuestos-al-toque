import { test, expect, devices } from '@playwright/test';

// Smoke en pantalla de celular (guarda que el layout mobile no se rompa).
test.use({ ...devices['Pixel 5'] });

test('mobile: landing carga', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/RepuestosAlToque/i);
});

test('mobile: login del mecánico y dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'mecanico@repuestosaltoque.com.ar');
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(/\/mecanico/);
  await expect(page.getByRole('link', { name: /Solicitar Repuesto/i })).toBeVisible();
});

test('mobile: el comercio ve sus pestañas', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'vendedor@repuestosaltoque.com.ar');
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(/\/comercio/);
  await expect(page.getByRole('button', { name: /Pedidos/i })).toBeVisible();
});
