import { test, expect } from '@playwright/test';

// Login real (necesita DB + cuentas del seed + AUTH_SECRET). Password de prueba: repuestos123.
const ACCOUNTS = [
  ['admin@repuestosaltoque.com.ar', /\/admin/],
  ['mecanico@repuestosaltoque.com.ar', /\/mecanico/],
  ['vendedor@repuestosaltoque.com.ar', /\/comercio/],
  ['repartidor@repuestosaltoque.com.ar', /\/repartidor/],
];

test.describe('Login real (rol según cuenta)', () => {
  for (const [email, home] of ACCOUNTS) {
    test(`${email} entra a su panel`, async ({ page }) => {
      await page.goto('/login');
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', 'repuestos123');
      await page.getByRole('button', { name: /Ingresar/i }).click();
      await expect(page).toHaveURL(home, { timeout: 15000 });
    });
  }

  test('contraseña incorrecta muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'mecanico@repuestosaltoque.com.ar');
    await page.fill('input[type="password"]', 'malita');
    await page.getByRole('button', { name: /Ingresar/i }).click();
    await expect(page.getByText(/incorrecta|no encontrada/i)).toBeVisible();
  });

  test('ruta protegida sin login redirige a /login', async ({ page }) => {
    await page.goto('/comercio');
    await expect(page).toHaveURL(/\/login/);
  });
});
