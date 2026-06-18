import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

// La patente va primero en el wizard y autocompleta el vehículo desde el historial del mecánico.
test('mecánico: la patente autocompleta el vehículo de un pedido anterior', async ({ page }) => {
  test.setTimeout(90000);
  const plate = uniquePlate();
  const desc = `Autofill E2E ${Date.now()}`;
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(page, desc, plate); // historial: Toyota Hilux 2019 · motor 1.4
  await publicarTrabajo(page);

  // nuevo pedido: tipear la patente conocida -> autocompleta marca y motor
  await page.goto('/mecanico/pedido');
  await page.getByPlaceholder('ABC123 o AB123CD').fill(plate);
  await expect(page.getByText(/Vehículo autocompletado/i)).toBeVisible({ timeout: 15000 });
  await expect(page.locator('select').first()).toHaveValue('Toyota');
  await expect(page.getByPlaceholder(/Multijet/i)).toHaveValue('1.4');
});
