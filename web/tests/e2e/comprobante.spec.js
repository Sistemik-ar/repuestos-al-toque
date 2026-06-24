import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { seedSale } from './db';

// El vendedor ve el comprobante de pago de una venta concretada (mecánico, fecha, monto, medio de pago).
test('comercio: ve el comprobante de pago de una venta', async ({ page }) => {
  const { desc } = await seedSale({ desc: `Comprob E2E ${Date.now()}`, part: 40000 }); // venta DELIVERED del vendedor seed
  await login(page, 'vendedor@repuestosaltoque.com.ar');
  await page.getByRole('button', { name: /Concretadas/i }).click();
  const card = page.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  await expect(page.getByRole('heading', { name: /Comprobante de pago/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText('Mercado Pago'); // medio de pago
});
