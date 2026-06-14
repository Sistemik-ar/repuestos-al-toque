import { test, expect } from '@playwright/test';
import { pickAddress } from './helpers';

async function login(page, email, home) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(home);
}

test.describe('Backoffice (admin)', () => {
  test('paneles del admin presentes', async ({ page }) => {
    await login(page, 'admin@repuestosaltoque.com.ar', /\/admin/);
    await expect(page.getByRole('heading', { name: 'Alta de usuario' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Comisión y recargo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Tarifas de envío/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Solicitudes de Cuenta Corriente/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  });

  test('alta de un vendedor + login con contraseña temporal', async ({ page, browser }) => {
    await login(page, 'admin@repuestosaltoque.com.ar', /\/admin/);
    const email = `e2e-store-${Date.now()}@rat.test`;
    await page.getByPlaceholder('Repuestos Centro').fill('E2E Store');
    await page.getByPlaceholder('cuenta@email.com').fill(email);
    await pickAddress(page); // dirección obligatoria por autocompletado
    await page.getByRole('button', { name: /Crear usuario/i }).click();

    const box = page.locator('.float-notif', { hasText: 'Usuario creado' });
    await expect(box).toBeVisible();
    const pwd = (await box.locator('.text-yellow').innerText()).trim();
    expect(pwd.length).toBeGreaterThanOrEqual(6);

    // login en un contexto nuevo con la cuenta recién creada
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await p2.goto('/login');
    await p2.fill('input[type="email"]', email);
    await p2.fill('input[type="password"]', pwd);
    await p2.getByRole('button', { name: /Ingresar/i }).click();
    await expect(p2).toHaveURL(/\/comercio/);
    await ctx.close();
  });

  test('rol mecánico NO puede entrar a /admin', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/mecanico/); // middleware lo manda a su panel
  });
});
