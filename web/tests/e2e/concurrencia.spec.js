import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { db } from './db';

// Escenarios de concurrencia y pestañas viejas — los que rompen plata en producción.

// helper: flujo hasta tener un trabajo con cotización elegida (devuelve jobId y desc)
async function trabajoElegido(browser, desc, plate, price = '30000') {
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill(price);
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 });

  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  const jobId = new URL(m.url()).searchParams.get('id');
  return { m, s, mc, sc, jobId };
}

test('doble confirmación de pago: una sola orden, sin doble cobro en la base', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `DoblePago E2E ${Date.now()}`;
  const { m, mc, sc, jobId } = await trabajoElegido(browser, desc, uniquePlate());

  // el webhook y el navegador confirman "a la vez" (x3 para estresar)
  const ref = encodeURIComponent('job::' + jobId);
  await Promise.all([
    m.request.get(`/api/mp/return?status=approved&external_reference=${ref}`),
    m.request.get(`/api/mp/return?status=approved&external_reference=${ref}`),
    m.request.get(`/api/mp/return?status=approved&external_reference=${ref}`),
  ]);

  const orders = await db().order.findMany({ where: { request: { description: desc } } });
  expect(orders).toHaveLength(1); // UNA sola orden por ítem, sin duplicados
  const job = await db().job.findUnique({ where: { id: jobId }, select: { status: true } });
  expect(job.status).toBe('PAID');

  await mc.close(); await sc.close();
});

test('pestaña vieja no puede cambiar la elección de un trabajo pagado', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `Stale E2E ${Date.now()}`;
  const { m, mc, sc, jobId } = await trabajoElegido(browser, desc, uniquePlate());

  // pestaña vieja: cotizaciones del ítem quedó abierta ANTES del pago
  const itemId = (await db().request.findFirst({ where: { description: desc }, select: { id: true } })).id;
  const stale = await mc.newPage();
  await stale.goto(`/mecanico/cotizaciones?id=${itemId}&job=${jobId}`);
  await expect(stale.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });

  // se paga el trabajo
  await m.request.get(`/api/mp/return?status=approved&external_reference=${encodeURIComponent('job::' + jobId)}`);

  // la pestaña vieja intenta re-elegir -> el server lo bloquea y el estado no cambia
  await stale.getByRole('button', { name: /Elegir oferta|Elegida/i }).first().click();
  await stale.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(stale.getByText(/ya no admite cambios|está bloqueada/i)).toBeVisible({ timeout: 10000 });
  const req = await db().request.findFirst({ where: { description: desc }, select: { status: true } });
  expect(req.status).toBe('PAID'); // sigue pagado, no se corrompió

  await mc.close(); await sc.close();
});

test('cotización enviada justo después del cierre de ventana es rechazada', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `Tarde E2E ${Date.now()}`;
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  // vendedor deja el modal de cotizar ABIERTO...
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('30000');

  // ...mientras el mecánico cierra la ventana...
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });

  // ...y recién ahí el vendedor aprieta Enviar -> rechazada con error claro
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.getByText(/ventana de cotización ya cerró/i)).toBeVisible({ timeout: 10000 });
  const quotes = await db().requestQuote.count({ where: { request: { description: desc } } });
  expect(quotes).toBe(0); // no entró ninguna cotización tardía

  await mc.close(); await sc.close();
});

test('dos repartidores tocan "Tomar pedido" a la vez: gana uno solo', async ({ browser }) => {
  test.setTimeout(120000);
  const desc = `Carrera E2E ${Date.now()}`;
  const { m, mc, sc, jobId } = await trabajoElegido(browser, desc, uniquePlate());
  await m.request.get(`/api/mp/return?status=approved&external_reference=${encodeURIComponent('job::' + jobId)}`);

  // dos sesiones de repartidor con el pedido en pantalla
  const d1c = await browser.newContext(); const d1 = await d1c.newPage();
  const d2c = await browser.newContext(); const d2 = await d2c.newPage();
  await login(d1, 'repartidor@repuestosaltoque.com.ar');
  await login(d2, 'repartidor@repuestosaltoque.com.ar');
  await expect(d1.locator('.card', { hasText: desc }).first()).toBeVisible({ timeout: 15000 });
  await expect(d2.locator('.card', { hasText: desc }).first()).toBeVisible({ timeout: 15000 });

  // click simultáneo
  await Promise.all([
    d1.locator('.card', { hasText: desc }).first().getByRole('button', { name: /Tomar pedido/i }).click(),
    d2.locator('.card', { hasText: desc }).first().getByRole('button', { name: /Tomar pedido/i }).click(),
  ]);

  // invariante en la base: el pedido quedó asignado UNA sola vez (claim atómico),
  // y ambas sesiones convergen al estado "tomado" (PIN visible) sin error de estado
  await expect.poll(async () => {
    const o = await db().order.findFirst({ where: { request: { description: desc } }, select: { deliveryId: true } });
    return o?.deliveryId || null;
  }, { timeout: 10000 }).not.toBeNull();
  await expect(d1.locator('.card', { hasText: desc }).getByText(/Mostrale este PIN/i)).toBeVisible({ timeout: 15000 });
  await expect(d2.locator('.card', { hasText: desc }).getByText(/Mostrale este PIN/i)).toBeVisible({ timeout: 15000 });

  await mc.close(); await sc.close(); await d1c.close(); await d2c.close();
});

test('retorno de MP con payment_id falso NO confirma (exige pago verificado)', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `Forjado E2E ${Date.now()}`;
  const { m, mc, sc, jobId } = await trabajoElegido(browser, desc, uniquePlate());

  // un atacante arma la URL de retorno con un payment_id inventado: getPayment lo consulta
  // contra MP, no existe/no está aprobado -> no se confirma nada.
  const ref = encodeURIComponent('job::' + jobId);
  await m.request.get(`/api/mp/return?payment_id=999999999999&status=approved&external_reference=${ref}`);

  const orders = await db().order.findMany({ where: { request: { description: desc } } });
  expect(orders).toHaveLength(0); // no se creó ninguna orden
  const job = await db().job.findUnique({ where: { id: jobId }, select: { status: true } });
  expect(job.status).not.toBe('PAID'); // el trabajo NO quedó pagado

  await mc.close(); await sc.close();
});

test('doble-tap en la elección nunca deja dos cotizaciones SELECTED', async ({ browser }) => {
  test.setTimeout(90000);
  const desc = `DobleTap E2E ${Date.now()}`;
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  // el vendedor manda DOS opciones para el mismo ítem (Original / Alternativa)
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  // 1ra opción: el pedido está en "Pendientes"
  const cardPend = s.locator('.card', { hasText: desc });
  await expect(cardPend).toBeVisible({ timeout: 15000 });
  await cardPend.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('30000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10000 });
  // 2da opción: al cotizar, el pedido pasó a "Cotizadas" → "Agregar otra opción"
  await s.getByRole('button', { name: /Cotizadas/i }).click();
  const cardCot = s.locator('.card', { hasText: desc });
  await expect(cardCot).toBeVisible({ timeout: 15000 });
  await cardCot.getByRole('button', { name: /Agregar otra opción/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('42000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.modal-backdrop')).toHaveCount(0, { timeout: 10000 });

  // cerrar ventana y abrir las cotizaciones en DOS pestañas
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  const itemId = (await db().request.findFirst({ where: { description: desc }, select: { id: true } })).id;
  const jobId = (await db().request.findFirst({ where: { description: desc }, select: { jobId: true } })).jobId;

  const t1 = await mc.newPage(); const t2 = await mc.newPage();
  for (const t of [t1, t2]) {
    await t.goto(`/mecanico/cotizaciones?id=${itemId}&job=${jobId}`);
    await expect(t.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  }
  // cada pestaña elige una oferta DISTINTA y confirma a la vez
  await t1.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await t2.getByRole('button', { name: /Elegir oferta/i }).last().click();
  await Promise.all([
    t1.getByRole('button', { name: /Confirmar elección/i }).click(),
    t2.getByRole('button', { name: /Confirmar elección/i }).click(),
  ]);

  // invariante: como mucho UNA cotización SELECTED (la transacción des-selecciona la otra)
  await expect.poll(async () =>
    db().requestQuote.count({ where: { request: { description: desc }, status: 'SELECTED' } }),
    { timeout: 10000 }
  ).toBeLessThanOrEqual(1);

  await mc.close(); await sc.close();
});

test('claim consolida por patente: un repartidor toma TODO el auto (no se parte el viaje)', async ({ browser }) => {
  test.setTimeout(120000);
  const stamp = Date.now();
  const plate = uniquePlate();
  const d1 = `Consol1 E2E ${stamp}`, d2 = `Consol2 E2E ${stamp}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, d1, plate);
  await crearItem(m, d2, plate); // mismo trabajo (misma patente)
  await publicarTrabajo(m);

  // el MISMO comercio cotiza ambos ítems
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  for (const d of [d1, d2]) {
    const card = s.locator('.card', { hasText: d });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.getByRole('button', { name: /Cotizar/i }).click();
    await s.locator('input[inputmode="numeric"]').first().fill('30000');
    await s.getByRole('button', { name: /Enviar Cotización/i }).click();
    await expect(s.locator('.card', { hasText: d })).toHaveCount(0, { timeout: 10000 });
  }

  // el mecánico cierra la ventana y elige ambos ítems
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  const jobId = new URL(m.url()).searchParams.get('id');
  for (const d of [d1, d2]) {
    await m.locator('.card', { hasText: d }).getByRole('link', { name: /Ver cotizaciones/i }).click();
    await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
    await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
    await m.getByRole('button', { name: /Confirmar elección/i }).click();
    await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  }
  // pagar el trabajo (atajo de prueba) -> dos órdenes PAID, mismo auto + mismo comercio
  await m.request.get(`/api/mp/return?status=approved&external_reference=${encodeURIComponent('job::' + jobId)}`);
  await expect.poll(async () =>
    db().order.count({ where: { request: { description: { in: [d1, d2] } }, status: 'PAID' } }),
    { timeout: 10000 }
  ).toBe(2);

  // el repartidor toma UN ítem -> el claim consolida y se lleva AMBAS órdenes del auto
  const rep = await db().user.findUnique({ where: { email: 'repartidor@repuestosaltoque.com.ar' }, select: { id: true } });
  const dc = await browser.newContext(); const dd = await dc.newPage();
  await login(dd, 'repartidor@repuestosaltoque.com.ar');
  await dd.locator('.card', { hasText: d1 }).first().getByRole('button', { name: /Tomar pedido/i }).click();

  await expect.poll(async () => {
    const ords = await db().order.findMany({ where: { request: { description: { in: [d1, d2] } } }, select: { deliveryId: true } });
    return ords.every((o) => o.deliveryId === rep.id) ? ords.length : -1;
  }, { timeout: 10000 }).toBe(2); // las DOS quedaron asignadas al MISMO repartidor

  await mc.close(); await sc.close(); await dc.close();
});

test('regenerar el link de pago devuelve EL MISMO link (no cobra doble)', async ({ browser }) => {
  test.setTimeout(120000);
  const desc = `MismoLink E2E ${Date.now()}`;
  const { m, mc, sc, jobId } = await trabajoElegido(browser, desc, uniquePlate());

  await m.getByRole('button', { name: /Generar link de pago/i }).click();
  await expect(m.getByRole('link', { name: /Mandar al dueño/i })).toBeVisible({ timeout: 20000 });
  const link1 = (await db().job.findUnique({ where: { id: jobId }, select: { paymentLink: true } })).paymentLink;
  expect(link1).toContain('mercadopago');

  // recarga (estado del cliente se pierde) y vuelve a generar
  await m.reload();
  await m.getByRole('button', { name: /Generar link de pago/i }).click();
  await expect(m.getByRole('link', { name: /Mandar al dueño/i })).toBeVisible({ timeout: 20000 });
  const link2 = (await db().job.findUnique({ where: { id: jobId }, select: { paymentLink: true } })).paymentLink;
  expect(link2).toBe(link1); // mismo link: imposible pagar dos preferencias distintas

  await mc.close(); await sc.close();
});
