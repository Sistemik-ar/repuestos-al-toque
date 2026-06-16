import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { seedCreditSale, removeSeededSale, removeJobByPlate, clearStoreCategories } from './db';

// Tests de las mejoras recientes: cuenta corriente "por cobrar", perfil read-only del comercio,
// detalle de pedido (modal) y bloqueo de cambio de rol con trabajo activo.
// Corre al final (zz-) y limpia todo lo que siembra para no afectar a los demás specs.

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';
const MECANICO = 'mecanico@repuestosaltoque.com.ar';

let sale = null;            // venta CC sembrada (para cleanup)
const platesToClean = [];   // patentes de trabajos creados por UI (para cleanup)

test.beforeAll(async () => { await clearStoreCategories(VENDEDOR); }); // el comercio ve todos los rubros
test.afterAll(async () => {
  if (sale) await removeSeededSale(sale);
  for (const pl of platesToClean) await removeJobByPlate(pl);
});

test('comercio: "Mi perfil" muestra datos + rubros y es SOLO lectura', async ({ browser }) => {
  test.setTimeout(60000);
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, VENDEDOR);
  await s.goto('/comercio/perfil');
  await expect(s.getByRole('heading', { name: /Mis datos/i })).toBeVisible({ timeout: 15000 });
  await expect(s.getByRole('heading', { name: /Lo que vendo/i })).toBeVisible();
  await expect(s.getByText(VENDEDOR)).toBeVisible(); // su email
  // read-only: no hay ningún botón de guardar/editar
  await expect(s.getByRole('button', { name: /Guardar|Editar/i })).toHaveCount(0);
  await sc.close();
});

test('comercio: "Ver detalle" abre el modal con el detalle del pedido', async ({ browser }) => {
  test.setTimeout(90000);
  const plate = uniquePlate(); platesToClean.push(plate);
  const desc = `Detalle E2E ${Date.now()}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, MECANICO);
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, VENDEDOR);
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  const modal = s.locator('.modal');
  await expect(modal).toBeVisible({ timeout: 10000 });
  await expect(modal.getByRole('heading', { name: desc })).toBeVisible(); // título del detalle
  await expect(modal.getByText(/Consumidor Final|Factura A/i)).toBeVisible(); // fila "Factura"
  await modal.getByRole('button', { name: /Cerrar/i }).click();
  await expect(s.locator('.modal')).toHaveCount(0, { timeout: 10000 });
  await mc.close(); await sc.close();
});

test('admin: con trabajo activo, el cambio de rol queda BLOQUEADO', async ({ browser }) => {
  test.setTimeout(90000);
  const plate = uniquePlate(); platesToClean.push(plate);
  const desc = `RolLock E2E ${Date.now()}`;
  // el mecánico seed genera trabajo activo (request OPEN)
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, MECANICO);
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  const row = a.locator('tr', { hasText: MECANICO });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: /Editar/i }).click();
  const modal = a.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Editar usuario/i })).toBeVisible({ timeout: 10000 });
  await expect(modal.locator('select').first()).toBeDisabled();          // el selector de rol
  await expect(modal.getByText(/no se puede cambiar/i)).toBeVisible();    // el cartel explicativo
  await ac.close(); await mc.close();
});

test('cuenta corriente: el comercio la ve en "Por cobrar", confirma el cobro, y el mecánico la ve en sus compras', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `CC cobrar ${Date.now()}`;
  sale = await seedCreditSale({ desc, amount: 45000, status: 'DELIVERED', creditAccount: true });

  // COMERCIO: la venta CC aparece en "Por cobrar" con su detalle
  const sc = await browser.newContext(); const s = await sc.newPage();
  s.on('dialog', (d) => d.accept()); // confirma el "¿ya te pagó?"
  await login(s, VENDEDOR);
  const row = s.locator('tr', { hasText: desc });
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row.getByText('$45.000')).toBeVisible();        // monto
  await expect(row.getByText(/Taller Patagonia/i)).toBeVisible(); // mecánico (nombre del taller seed)
  await expect(row.getByText(/Pendiente de pago/i)).toBeVisible(); // estado inicial
  // marcar cobrada (confirma el alertbox)
  await row.getByRole('button', { name: /Marcar cobrada/i }).click();
  await expect(s.getByText(/Cuenta corriente cobrada/i)).toBeVisible({ timeout: 10000 });
  await expect(s.locator('tr', { hasText: desc }).getByText(/Cobrada/i)).toBeVisible({ timeout: 10000 }); // estado pasó a Cobrada

  // MECÁNICO: la ve en "Mis compras en cuenta corriente" como cobrada por el comercio
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, MECANICO);
  await m.goto('/mecanico/cuentas');
  const mrow = m.locator('tr', { hasText: desc });
  await expect(mrow).toBeVisible({ timeout: 15000 });
  await expect(mrow.getByText(/Cobrada por el comercio/i)).toBeVisible();

  await sc.close(); await mc.close();
});
