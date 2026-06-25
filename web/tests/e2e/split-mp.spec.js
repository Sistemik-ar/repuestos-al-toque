import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { ensureStore2, linkStoreMp, unlinkStoreMp, seedSale } from './db';

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';
const STORE2 = 'e2e-store2@rat.test';

// Deja todo desvinculado para no afectar a otros specs (el banner/estado depende de mpLinked).
test.afterAll(async () => { await unlinkStoreMp(VENDEDOR); await unlinkStoreMp(STORE2); });

// Comercio SIN vincular: ve el banner para conectar + el CTA en su perfil.
test('comercio sin MP: banner para conectar + CTA en el perfil', async ({ page }) => {
  await unlinkStoreMp(VENDEDOR);
  await login(page, VENDEDOR);
  await expect(page.getByText(/Conectá tu Mercado Pago/i)).toBeVisible({ timeout: 15000 }); // banner en el panel
  await expect(page.getByRole('button', { name: /Conectar con Mercado Pago/i }).first()).toBeVisible();
  await page.goto('/comercio/perfil');
  await expect(page.getByRole('heading', { name: 'Cobros' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Conectar con Mercado Pago/i })).toBeVisible(); // CTA, todavía no vinculado
});

// Comercio CON MP vinculado: sin banner + "Tu dinero" con el detalle de una venta.
test('comercio con MP: "Tu dinero" muestra acreditado y detalle por venta', async ({ page }) => {
  await ensureStore2();
  await linkStoreMp(STORE2);
  await seedSale({ storeEmail: STORE2, desc: `SplitTuDinero E2E ${Date.now()}`, part: 39900, commissionPct: 5, freight: 4200 });
  await login(page, STORE2);
  await expect(page.getByText(/Conectá tu Mercado Pago/i)).toHaveCount(0); // ya vinculado -> sin banner
  await page.goto('/comercio/perfil');
  await expect(page.getByText(/MP conectado/i)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Acreditado en tu Mercado Pago/i)).toBeVisible();
  await expect(page.getByText('+$39.900')).toBeVisible(); // lo que le entra al comercio por esa venta
});

// Admin: la sección Cobros muestra quién conectó su MP y quién no.
test('admin/cobros: estado de conexión MP por comercio', async ({ page }) => {
  await ensureStore2();
  await linkStoreMp(STORE2);
  await unlinkStoreMp(VENDEDOR);
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=cobros');
  await expect(page.getByText('Conectados').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.card .flex-between').filter({ hasText: 'Repuestos Dos' }).getByText('Conectado')).toBeVisible();
  await expect(page.locator('.card .flex-between').filter({ hasText: 'Repuestos Centro' }).getByText('Sin conectar')).toBeVisible();
});

// Admin: el comprobante del pedido muestra cómo se divide el pago (split).
test('admin/pedidos: el comprobante muestra el detalle del split', async ({ page }) => {
  const { desc } = await seedSale({ desc: `SplitDetalle E2E ${Date.now()}`, part: 50000, commissionPct: 10, freight: 7000 });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(desc);
  const row = page.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Total"] button').click(); // abre el comprobante
  await expect(page.getByRole('heading', { name: /Cómo se divide \(split MP\)/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.modal')).toContainText('Repuestos Centro'); // a la cuenta del comercio
  await expect(page.locator('.modal')).toContainText('$50.000'); // el repuesto va al comercio
});
