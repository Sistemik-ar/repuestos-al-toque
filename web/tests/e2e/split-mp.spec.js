import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { ensureStore2, linkStoreMp, unlinkStoreMp, seedSale } from './db';

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';
const STORE2 = 'e2e-store2@rat.test';
const MECANICO = 'mecanico@repuestosaltoque.com.ar';

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

// Admin ("nosotros"): el comprobante muestra el desglose COMPLETO + cómo se divide el split.
// part 50.000 · comisión 10% = 5.000 · envío 7.000 · recargo MP 3.000 → total 65.000.
// Split: el comercio recibe el repuesto (50.000); la plataforma retiene el resto (15.000).
test('admin/pedidos: el comprobante muestra el desglose full + cómo se divide el split', async ({ page }) => {
  const { desc } = await seedSale({ desc: `SplitDetalle E2E ${Date.now()}`, part: 50000, commissionPct: 10, freight: 7000, mpFee: 3000 });
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=pedidos');
  await page.getByPlaceholder(/Buscar mec/i).fill(desc);
  const row = page.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.locator('td[data-label="Total"] button').click(); // abre el comprobante
  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Comprobante de pago/i })).toBeVisible({ timeout: 10000 });
  // desglose completo
  await expect(modal.getByText('Vendido por')).toBeVisible();
  await expect(modal).toContainText('Repuestos Centro');
  await expect(modal.getByText(/Comisión \(10%\)/)).toBeVisible();
  await expect(modal.getByText(/Recargo Mercado Pago/)).toBeVisible();
  await expect(modal.getByText(/Total cobrado/)).toBeVisible();
  await expect(modal).toContainText('$65.000'); // total cobrado
  // cómo se divide (split MP): comercio = repuesto; plataforma = comisión + flete + recargo
  await expect(modal.getByRole('heading', { name: /Cómo se divide \(split MP\)/i })).toBeVisible();
  await expect(modal.locator('.mp-split-row').filter({ hasText: 'Repuestos Centro' })).toContainText('$50.000');
  await expect(modal.locator('.mp-split-row').filter({ hasText: 'RepuestosAlToque' })).toContainText('$15.000');
});

// Mecánico (comprador): el detalle del pedido pagado muestra su comprobante con el desglose full.
test('mecánico: el detalle del pedido pagado muestra el desglose completo', async ({ page }) => {
  const { requestId } = await seedSale({ desc: `MecCompr E2E ${Date.now()}`, part: 50000, commissionPct: 10, freight: 7000, mpFee: 3000 });
  await login(page, MECANICO);
  await page.goto(`/mecanico/detalle?id=${requestId}`);
  const pago = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Pago', exact: true }) });
  await expect(pago).toBeVisible({ timeout: 15000 });
  await expect(pago.getByText(/Comisión \(10%\)/)).toBeVisible();
  await expect(pago.getByText('Envío')).toBeVisible();
  await expect(pago.getByText(/Recargo Mercado Pago/)).toBeVisible();
  await expect(pago).toContainText('$50.000'); // repuesto
  await expect(pago).toContainText('$7.000');  // envío
  await expect(pago).toContainText('$3.000');  // recargo MP
  await expect(pago.getByText('$65.000')).toBeVisible(); // total pagado
});

// Comercio (vendedor): el detalle de una venta muestra su comprobante (repuesto + medio de pago).
test('comercio: el comprobante de una venta muestra el repuesto y el medio de pago', async ({ page }) => {
  const desc = `ComCompr E2E ${Date.now()}`;
  await seedSale({ desc, part: 50000 }); // venta del vendedor seed (DELIVERED)
  await login(page, VENDEDOR);
  await page.getByRole('button', { name: /Concretad/i }).click(); // pestaña Concretadas
  const card = page.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  const modal = page.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Comprobante de pago/i })).toBeVisible({ timeout: 10000 });
  await expect(modal.getByText(/Monto del repuesto/i)).toBeVisible();
  await expect(modal).toContainText('$50.000'); // lo que cobra el comercio
  await expect(modal.getByText(/Medio de pago/i)).toBeVisible();
  await expect(modal.getByText('Mercado Pago', { exact: true })).toBeVisible();
});
