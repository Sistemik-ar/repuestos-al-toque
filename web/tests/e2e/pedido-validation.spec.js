import { test, expect } from '@playwright/test';
import { login, uniquePlate } from './helpers';

test.describe('Validación del pedido', () => {
  test('patente o VIN obligatorio: sin patente no se puede continuar', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await expect(continuar).toBeDisabled();
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await expect(continuar).toBeDisabled(); // vehículo sí, pero falta patente
    await page.getByPlaceholder('ABC123 o AB123CD').fill('XYZ'); // formato inválido
    await expect(page.getByText(/Formato: ABC123/i)).toBeVisible();
    await expect(continuar).toBeDisabled();
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await expect(continuar).toBeEnabled();
  });

  test('la descripción del repuesto es obligatoria', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await page.getByRole('button', { name: /Continuar/i }).click();
    await page.locator('text=Frenos').first().click();
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await expect(continuar).toBeDisabled();
    await page.locator('textarea').first().fill('Pastillas de freno E2E');
    await expect(continuar).toBeEnabled();
  });

  test('Factura A: bloquea sin datos / CUIT inválido, habilita con datos OK', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await page.getByRole('button', { name: /Continuar/i }).click();
    await page.locator('text=Frenos').first().click();
    await page.locator('textarea').first().fill('Pastillas de freno E2E');

    await page.getByRole('button', { name: 'Factura A' }).click();
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await expect(continuar).toBeDisabled();

    await page.getByPlaceholder('Tu razón social').fill('Taller Patagonia');
    await page.getByPlaceholder('11 dígitos').fill('123');
    await expect(page.getByText(/El CUIT debe tener 11 dígitos/i)).toBeVisible();
    await expect(continuar).toBeDisabled();

    await page.getByPlaceholder('11 dígitos').fill('20111111110');
    await expect(continuar).toBeEnabled();
    await continuar.click();
    await expect(page.locator('text=Paso 4 de 5')).toBeVisible();
  });
});
