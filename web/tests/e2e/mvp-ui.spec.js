import { test, expect } from '@playwright/test';
import { login, uniquePlate } from './helpers';

// Cobertura de los cambios de UI del MVP (urgencia, categorías nuevas, vuelta de Mercado Pago).
test.describe('Cambios MVP (UI)', () => {
  test('urgencia: solo "Necesito ahora" y "Hoy" (sin "Mañana")', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await page.getByRole('button', { name: /Continuar/i }).click(); // -> paso 2
    await page.locator('text=Frenos').first().click(); // -> paso 3 (auto-avance)
    await expect(page.getByRole('heading', { name: /Describí el repuesto/i })).toBeVisible();
    await page.locator('textarea').first().fill('Pastillas E2E');
    await page.getByRole('button', { name: /Continuar/i }).click(); // -> paso 4
    await expect(page.getByText(/¿Para cuándo lo necesitás/i)).toBeVisible();
    await expect(page.getByText('Necesito ahora').first()).toBeVisible();
    await expect(page.getByText(/^Hoy$/)).toBeVisible();
    await expect(page.getByText('Mañana')).toHaveCount(0); // se sacó "Mañana · Sin apuro"
  });

  test('categorías del wizard: incluyen las nuevas y NO "Otros" ni "Lubricación"', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico/pedido');
    await page.locator('button:has-text("Toyota Hilux")').first().click();
    await page.getByPlaceholder('ABC123 o AB123CD').fill(uniquePlate());
    await page.getByRole('button', { name: /Continuar/i }).click(); // -> paso 2 (categorías)
    await expect(page.getByText(/¿Qué tipo de repuesto/i)).toBeVisible();
    for (const c of ['Accesorios y equipamiento', 'Inyección y combustible', 'Lubricentro', 'Suspensión y dirección', 'Frenos']) {
      await expect(page.getByText(c, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Otros', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Lubricación', { exact: true })).toHaveCount(0);
  });

  test('vuelta de Mercado Pago: ?pago=pend y ?pago=ok avisan en el panel', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await page.goto('/mecanico?pago=pend');
    await expect(page.getByText(/Pago en proceso/i)).toBeVisible({ timeout: 10000 });
    await page.goto('/mecanico?pago=ok');
    await expect(page.getByText(/Pago confirmado/i)).toBeVisible({ timeout: 10000 });
  });
});
