import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { seedCreditSale, seedChosenQuote, removeSeededSale, removeJobByPlate, clearStoreCategories, clearCreditPayments } from './db';

// Tests de las mejoras recientes: cuenta corriente "por cobrar", perfil read-only del comercio,
// detalle de pedido (modal) y bloqueo de cambio de rol con trabajo activo.
// Corre al final (zz-) y limpia todo lo que siembra para no afectar a los demás specs.

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';
const MECANICO = 'mecanico@repuestosaltoque.com.ar';

let sale = null;            // venta CC sembrada (para cleanup)
let chosen = null;          // cotización elegida sembrada (para cleanup)
const platesToClean = [];   // patentes de trabajos creados por UI (para cleanup)

test.beforeAll(async () => { await clearStoreCategories(VENDEDOR); await clearCreditPayments(); }); // el comercio ve todos los rubros + sin pagos CC residuales
test.afterAll(async () => {
  if (sale) await removeSeededSale(sale);
  if (chosen) await removeSeededSale(chosen);
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
  await expect(modal.getByRole('heading', { name: /Detalle del pedido/i })).toBeVisible(); // título del detalle
  await expect(modal.getByText(desc)).toBeVisible(); // el repuesto en el subtítulo
  await expect(modal.getByText(/Consumidor Final|Factura A/i)).toBeVisible(); // fila "Factura"
  await modal.getByRole('button', { name: /Cancelar/i }).click();
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
  await a.getByPlaceholder(/nombre, email o rol/i).fill('Taller Patagonia'); // nombre único del taller seed (paginado)
  const row = a.locator('tr', { hasText: MECANICO });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: /Editar/i }).click();
  const modal = a.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Editar usuario/i })).toBeVisible({ timeout: 10000 });
  await expect(modal.locator('select').first()).toBeDisabled();          // el selector de rol
  await expect(modal.getByText(/no se puede cambiar/i)).toBeVisible();    // el cartel explicativo
  await ac.close(); await mc.close();
});

test('cuenta corriente: el comercio registra el pago y la cuenta del taller queda saldada', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `CC cobrar ${Date.now()}`;
  sale = await seedCreditSale({ desc, amount: 45000, status: 'DELIVERED', creditAccount: true });

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, VENDEDOR);
  await s.getByRole('button', { name: /Por cobrar/i }).click(); // tab Por cobrar
  const card = s.locator('.cmz-acc', { hasText: 'Taller Patagonia' }); // tarjeta de cuenta agrupada por taller
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.getByText('$45.000').first()).toBeVisible(); // saldo / facturado

  // registrar el pago (el monto viene prellenado con el saldo)
  await card.getByRole('button', { name: /Registrar pago/i }).click();
  const modal = s.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Registrar pago/i })).toBeVisible({ timeout: 10000 });
  await modal.getByRole('button', { name: /Registrar pago/i }).click();
  await expect(s.getByText(/Pago registrado/i)).toBeVisible({ timeout: 10000 });

  // saldo a 0: sale del filtro "Con saldo"; en "Todas" aparece como Saldada
  await s.getByRole('button', { name: /Todas/i }).click();
  await expect(s.locator('.cmz-acc', { hasText: 'Taller Patagonia' }).getByText(/Saldada/i)).toBeVisible({ timeout: 10000 });

  await sc.close();
});

test('comercio: el detalle de un PENDIENTE muestra el estado, y tocar fuera del modal de cotizar NO pierde el borrador', async ({ browser }) => {
  test.setTimeout(90000);
  const plate = uniquePlate(); platesToClean.push(plate);
  const desc = `Draft E2E ${Date.now()}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, MECANICO);
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, VENDEDOR);
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });

  // 1) Detalle del pendiente: abre el modal de cotización con el detalle + el formulario
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  await expect(s.locator('.modal').getByRole('heading', { name: /Detalle del pedido/i })).toBeVisible({ timeout: 10000 });
  await expect(s.locator('.modal').getByText(/Tu cotización/i)).toBeVisible();
  await s.locator('.modal').getByRole('button', { name: /Cancelar/i }).click();
  await expect(s.locator('.modal')).toHaveCount(0, { timeout: 10000 });

  // 2) Abro de nuevo, cargo precio, toco AFUERA -> pide confirmación; al rechazarla, NO se pierde
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  const modal = s.locator('.modal');
  await expect(modal).toBeVisible({ timeout: 10000 });
  await modal.locator('input[inputmode="numeric"]').first().fill('45000');
  s.once('dialog', (d) => d.dismiss()); // rechaza el "¿descartar?"
  await s.locator('.modal-backdrop').click({ position: { x: 6, y: 6 } }); // toque fuera del modal
  await expect(modal).toBeVisible(); // sigue abierto
  await expect(modal.locator('input[inputmode="numeric"]').first()).toHaveValue('45000'); // precio intacto

  await mc.close(); await sc.close();
});

test('comercio: el detalle de una cotización elegida sin pagar dice "Esperando pago"', async ({ browser }) => {
  test.setTimeout(60000);
  const desc = `Esperando pago E2E ${Date.now()}`;
  chosen = await seedChosenQuote({ desc, price: 38000 });

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, VENDEDOR);
  await s.getByRole('button', { name: /Enviadas/i }).click();
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Ver detalle/i }).click();
  await expect(s.locator('.modal').getByText(/Esperando pago del mec[áa]nico/i)).toBeVisible({ timeout: 10000 });
  await sc.close();
});
