import { test, expect } from '@playwright/test';

async function login(page, email) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(/\/mecanico/);
}

test.describe('Validación del pedido', () => {
  test('no se puede continuar sin elegir vehículo', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await expect(page.getByRole('button', { name: /Continuar/i })).toBeDisabled();
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await expect(page.getByRole('button', { name: /Continuar/i })).toBeEnabled();
  });

  test('la descripción del repuesto es obligatoria', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByRole('button', { name: /Continuar/i }).click();
    await page.locator('text=Frenos').first().click(); // paso 3 (consumidor final por defecto)
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await expect(continuar).toBeDisabled();
    await page.locator('textarea').first().fill('Pastillas de freno E2E');
    await expect(continuar).toBeEnabled();
  });

  test('Factura A: bloquea sin datos / CUIT inválido, habilita con datos OK', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByRole('button', { name: /Continuar/i }).click();
    await page.locator('text=Frenos').first().click();
    await page.locator('textarea').first().fill('Pastillas de freno E2E');

    await page.getByRole('button', { name: 'Factura A' }).click();
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await expect(continuar).toBeDisabled(); // falta completar Factura A

    await page.getByPlaceholder('Razón social del comercio').fill('Repuestos Centro SA');
    await page.getByPlaceholder('11 dígitos').first().fill('123'); // CUIT inválido
    await expect(page.getByText(/El CUIT debe tener 11 dígitos/i).first()).toBeVisible();
    await expect(continuar).toBeDisabled();

    await page.getByPlaceholder('11 dígitos').first().fill('30123456789');
    await page.getByPlaceholder('Razón social del solicitante').fill('Taller Patagonia');
    await page.getByPlaceholder('11 dígitos').nth(1).fill('20111111110');
    await expect(continuar).toBeEnabled();
    await continuar.click();
    await expect(page.locator('text=Paso 4 de 5')).toBeVisible();
  });
});
