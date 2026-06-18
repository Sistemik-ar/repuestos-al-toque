import { test, expect } from '@playwright/test';
import { login, uniquePlate, pickVehiculo } from './helpers';

// Validación del pedido: el botón "Continuar" NO queda gris (no daba feedback). Siempre responde,
// y al intentar avanzar incompleto marca el campo faltante en rojo y no pasa de paso.
test.describe('Validación del pedido', () => {
  test('patente o VIN obligatorio: sin patente se marca y no avanza', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await pickVehiculo(page); // marca+modelo+año
    await page.getByPlaceholder(/Multijet/i).fill('1.4'); // motorización OK -> el único faltante es la patente
    await continuar.click(); // intenta avanzar incompleto
    await expect(page.getByText(/Cargá la patente/i).first()).toBeVisible(); // marca el faltante (toast + inline)
    await expect(page.getByText(/¿Para qué vehículo/i)).toBeVisible(); // sigue en Paso 1
    await page.getByPlaceholder('ABC123 o AB123CD').fill('XYZ'); // formato inválido
    await expect(page.getByText(/Formato: ABC123/i)).toBeVisible();
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await continuar.click();
    await expect(page.getByText(/¿Qué tipo de repuesto/i)).toBeVisible(); // ahora sí avanza a Paso 2
  });

  test('la descripción del repuesto es obligatoria', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await pickVehiculo(page);
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await page.getByPlaceholder(/Multijet/i).fill('1.4'); // motorización (obligatoria)
    await page.getByRole('button', { name: /Continuar/i }).click();
    await page.locator('text=Frenos').first().click();
    await expect(page.getByRole('heading', { name: /Describí el repuesto/i })).toBeVisible(); // esperar Paso 3 (auto-avance 200ms)
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await continuar.click(); // sin detalle
    await expect(page.getByText(/Describí el repuesto que necesitás/i)).toBeVisible();
    await page.locator('textarea').first().fill('Pastillas de freno E2E');
    await continuar.click();
    await expect(page.getByText(/¿Para cuándo lo necesitás/i)).toBeVisible(); // avanzó a Paso 4
  });

  test('Factura A: marca razón social / CUIT inválido, avanza con datos OK', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await pickVehiculo(page);
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await page.getByPlaceholder(/Multijet/i).fill('1.4'); // motorización (obligatoria)
    await page.getByRole('button', { name: /Continuar/i }).click();
    await page.locator('text=Frenos').first().click();
    await page.locator('textarea').first().fill('Pastillas de freno E2E');

    await page.getByRole('button', { name: 'Factura A' }).click();
    const continuar = page.getByRole('button', { name: /Continuar/i });
    await continuar.click(); // sin datos de factura
    await expect(page.getByText(/Completá la razón social/i)).toBeVisible();

    await page.getByPlaceholder('Tu razón social').fill('Taller Patagonia');
    await page.getByPlaceholder('11 dígitos').fill('123');
    await expect(page.getByText(/El CUIT debe tener 11 dígitos/i)).toBeVisible();
    await continuar.click();
    await expect(page.getByText(/¿Para cuándo lo necesitás/i)).toHaveCount(0); // CUIT inválido: no avanza

    await page.getByPlaceholder('11 dígitos').fill('20111111110');
    await continuar.click();
    await expect(page.locator('text=Paso 4 de 5')).toBeVisible();
  });
});
