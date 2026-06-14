import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo, cotizar } from './helpers';
import { db, ensureCC } from './db';

// Flujos de borde menos transitados: cancelar todo, "volver a pedir" y checkout con cuenta corriente.

test('desestimar TODOS los ítems cancela el trabajo (no queda zombie activo)', async ({ browser }) => {
  test.setTimeout(120000);
  const stamp = Date.now();
  const plate = uniquePlate();
  const d1 = `CancelAll1 E2E ${stamp}`, d2 = `CancelAll2 E2E ${stamp}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  m.on('dialog', (d) => d.accept()); // confirma los window.confirm de "Desestimar"
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, d1, plate);
  await crearItem(m, d2, plate);
  await publicarTrabajo(m);
  const jobId = new URL(m.url()).searchParams.get('id');

  // desestimar ambos ítems
  for (const d of [d1, d2]) {
    await m.locator('.card', { hasText: d }).getByRole('button', { name: /Desestimar/i }).click();
    await expect(m.locator('.card', { hasText: d }).getByText(/Cancelado/i)).toBeVisible({ timeout: 10000 });
  }
  // el trabajo entero quedó CANCELADO (no activo)
  await expect.poll(async () => (await db().job.findUnique({ where: { id: jobId }, select: { status: true } }))?.status, { timeout: 10000 }).toBe('CANCELLED');
  await m.goto('/mecanico');
  await expect(m.getByRole('heading', { name: /^Cancelados$/ })).toBeVisible({ timeout: 15000 });
  await expect(m.locator('.card', { hasText: plate })).toBeVisible();

  await mc.close();
});

test('"volver a pedir" un ítem cancelado lo republica y el comercio lo vuelve a ver', async ({ browser }) => {
  test.setTimeout(120000);
  const stamp = Date.now();
  const plate = uniquePlate();
  const desc = `Reorder E2E ${stamp}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  m.on('dialog', (d) => d.accept());
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);
  const itemId = (await db().request.findFirst({ where: { description: desc }, select: { id: true } })).id;

  // desestimar (cancela el ítem y, como es único, el trabajo)
  await m.locator('.card', { hasText: desc }).getByRole('button', { name: /Desestimar/i }).click();
  await expect(m.locator('.card', { hasText: desc }).getByText(/Cancelado/i)).toBeVisible({ timeout: 10000 });

  // volver a pedir desde el detalle del ítem
  await m.goto(`/mecanico/detalle?id=${itemId}`);
  await m.getByRole('button', { name: /Volver a pedir/i }).first().click();
  await expect(m).toHaveURL(/\/mecanico(\/trabajo)?/, { timeout: 15000 });

  // el comercio lo ve de nuevo en Pendientes (es un pedido nuevo, publicado)
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await expect(s.locator('.card', { hasText: desc })).toBeVisible({ timeout: 15000 });

  await mc.close(); await sc.close();
});

test('checkout con Cuenta Corriente: el repuesto NO se cobra acá (solo comisión + envío)', async ({ browser }) => {
  test.setTimeout(120000);
  const stamp = Date.now();
  const plate = uniquePlate();
  const desc = `CC E2E ${stamp}`;
  await ensureCC(); // CC activa mecánico<->vendedor seed

  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await cotizar(s, desc, '50000');

  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo/);

  // activar Cuenta Corriente en el ítem (el toggle aparece porque hay CC activa con ese comercio)
  await m.getByText(/Pagar este repuesto con Cuenta Corriente/i).click();
  // generar link y verificar el desglose: el repuesto va a CC (no se cobra acá)
  await m.getByRole('button', { name: /Generar link de pago/i }).click();
  await expect(m.getByText(/A cuenta corriente \(no se cobra acá\)/i)).toBeVisible({ timeout: 20000 });

  // en la base, la orden NO se crea hasta pagar; el ítem quedó marcado useCredit
  const req = await db().request.findFirst({ where: { description: desc }, select: { useCredit: true } });
  expect(req.useCredit).toBe(true);

  await mc.close(); await sc.close();
});

// limpieza: dejar la CC seed desactivada para no afectar a cuenta-corriente.spec
test.afterAll(async () => {
  const p = db();
  const mech = await p.user.findUnique({ where: { email: 'mecanico@repuestosaltoque.com.ar' } });
  const store = await p.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' } });
  if (mech && store) await p.creditAccount.deleteMany({ where: { mechanicId: mech.id, storeId: store.id } });
});
