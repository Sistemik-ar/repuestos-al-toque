import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Ningún ítem de navegación debe ser un "dead end": cada uno carga una página real
// (no la landing pública, no un 404, y manteniendo la sesión del mecánico).
test('BottomNav del mecánico: todos los ítems llevan a una página real', async ({ page }) => {
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  await expect(page).toHaveURL(/\/mecanico$/);

  // Perfil
  await page.locator('.bottom-nav').getByRole('link', { name: /Perfil/i }).click();
  await expect(page).toHaveURL(/\/mecanico\/perfil/);
  await expect(page.getByText(/Mi perfil/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Cerrar sesión/i }).first()).toBeVisible();

  // Cuentas (lo que antes era el botón muerto "Envíos")
  await page.goto('/mecanico');
  await page.locator('.bottom-nav').getByRole('link', { name: /Cuentas/i }).click();
  await expect(page).toHaveURL(/\/mecanico\/cuentas/);

  // Botón "+" (nuevo pedido) — reemplazó a la pestaña "Cotizaciones", que no aplica en Trabajos
  await page.goto('/mecanico');
  await page.locator('.bottom-nav a.fab').click();
  await expect(page).toHaveURL(/\/mecanico\/pedido/);

  // sigue logueado como mecánico en todas (ninguna rebotó a /login ni a la landing)
  await expect(page).not.toHaveURL(/\/login/);
});

// Desde el perfil se puede cerrar sesión de verdad.
test('Perfil: cerrar sesión vuelve al login', async ({ page }) => {
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  await page.goto('/mecanico/perfil');
  await page.getByRole('button', { name: /Cerrar sesión/i }).first().click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
});
