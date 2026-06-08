import { test, expect } from '@playwright/test';

async function login(page, email) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(/\/mecanico/);
}

test.describe('Validación del pedido (Factura A)', () => {
  test('Factura A bloquea continuar sin datos y avanza con datos válidos', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByRole('button', { name: /Continuar/i }).click(); // -> categoría
    await page.locator('text=Frenos').first().click(); // -> paso 3 (Descripción)

    // Elegir Factura A: el botón Continuar queda deshabilitado sin datos
    await page.getByRole('button', { name: 'Factura A' }).click();
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await expect(continuar).toBeDisabled();

    // CUIT inválido (no 11 dígitos) -> sigue deshabilitado + muestra error
    await page.getByPlaceholder('Razón social del comercio').fill('Repuestos Centro SA');
    await page.getByPlaceholder('11 dígitos').first().fill('123');
    await expect(page.getByText(/El CUIT debe tener 11 dígitos/i).first()).toBeVisible();
    await expect(continuar).toBeDisabled();

    // Completar datos válidos (CUIT de 11 dígitos) -> se habilita y avanza
    await page.getByPlaceholder('11 dígitos').first().fill('30123456789');
    await page.getByPlaceholder('Razón social del solicitante').fill('Taller Patagonia');
    await page.getByPlaceholder('11 dígitos').nth(1).fill('20111111110');
    await expect(continuar).toBeEnabled();
    await continuar.click();
    await expect(page.locator('text=Paso 4 de 5')).toBeVisible();
  });
});
