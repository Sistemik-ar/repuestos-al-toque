import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { seedChosenQuote } from './db';

// El admin tiene que ver qué mecánico (usuario) hizo cada pedido en la tabla de Pedidos.
test('admin: la tabla de Pedidos muestra el mecánico que hizo el pedido', async ({ page }) => {
  const desc = `MecCol E2E ${Date.now()}`;
  await seedChosenQuote({ desc }); // pedido del mecánico seed (mecanico@ = "Taller Patagonia")
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.getByRole('button', { name: /Pedidos/i }).click();
  await page.getByPlaceholder(/Buscar mecánico/i).fill(desc);
  const row = page.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.locator('td[data-label="Mecánico"]')).toContainText('Taller Patagonia');
});
