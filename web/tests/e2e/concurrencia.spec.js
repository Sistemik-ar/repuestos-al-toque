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
