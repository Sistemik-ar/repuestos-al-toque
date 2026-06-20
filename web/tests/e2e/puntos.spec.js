import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo, pickAddress } from './helpers';
import { db, storeRatingStats, deliveryRatingStats, avgFromRatings } from './db';

// Sistema de puntos y reputación:
// - La calificación del mecánico alimenta el promedio del VENDEDOR (ordena sus cotizaciones)
//   y el del REPARTIDOR (visible en su panel).
// - Cada venta concretada (entrega con PIN) suma +1 punto al vendedor y al repartidor;
//   de los puntos salen los niveles/insignias.
// - Un comercio sin reseñas cotiza como "Nuevo" (sin número inventado) y ordena al final.

// Ciclo completo con calificaciones DISTINTAS por rubro (vendedor 5, producto 3, delivery 4)
// para verificar que cada promedio se calcula de verdad y no se copia un mismo valor.
test('la calificación actualiza promedio y puntos de vendedor Y repartidor', async ({ browser }) => {
  test.setTimeout(150000);
  const plate = uniquePlate();
  const desc = `Puntos E2E ${Date.now()}`;

  const storeBefore = await storeRatingStats();
  const delivBefore = await deliveryRatingStats();

  // compra completa: pedido → cotización → elegir → pagar
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('25000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  // señal determinística (no depende del timing del polling): el toast de éxito
  await expect(s.getByText(/Cotización enviada/i)).toBeVisible({ timeout: 10000 });

  await m.bringToFront();
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  const jobId = new URL(m.url()).searchParams.get('id');
  await m.goto(`/api/mp/return?status=approved&external_reference=${encodeURIComponent('job::' + jobId)}`);

  // reparto: tomar → retiro con PIN → entrega con PIN
  const dc = await browser.newContext(); const d = await dc.newPage();
  await login(d, 'repartidor@repuestosaltoque.com.ar');
  const dCard = d.locator('.card', { hasText: desc }).first();
  await expect(dCard).toBeVisible({ timeout: 15000 });
  await dCard.getByRole('button', { name: /Tomar viaje/i }).click();
  const miCard = d.locator('.card', { hasText: desc }).first();
  await expect(miCard.getByText(/Mostrale este PIN al vendedor/i)).toBeVisible({ timeout: 15000 });
  const pickupPin = (await miCard.locator('.pickup-pin').innerText()).replace(/\D/g, '');

  await s.reload();
  await s.getByRole('button', { name: /Concretadas/i }).click();
  const vCard = s.locator('.card', { hasText: desc }).first();
  await vCard.getByPlaceholder('PIN').fill(pickupPin);
  await vCard.getByRole('button', { name: /Confirmar retiro/i }).click();
  await expect(vCard.getByText(/Retirado · en camino/i)).toBeVisible({ timeout: 15000 });

  await m.goto(`/mecanico/trabajo?id=${jobId}`);
  await m.locator('.card', { hasText: desc }).getByRole('link', { name: /Ver detalle y seguimiento/i }).click();
  await expect(m.getByText(/Tu PIN de entrega/i)).toBeVisible({ timeout: 15000 });
  const dropPin = (await m.locator('.h-lg.text-yellow').innerText()).replace(/\D/g, '');

  await d.reload();
  const enCamino = d.locator('.card', { hasText: desc }).first();
  await enCamino.getByPlaceholder('PIN').fill(dropPin);
  await enCamino.getByRole('button', { name: /Confirmar entrega/i }).click();
  await expect(d.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 15000 });

  // venta concretada => +1 punto para cada uno (aunque todavía no haya reseña)
  await expect.poll(async () => (await storeRatingStats()).points, { timeout: 10000 }).toBe(storeBefore.points + 1);
  await expect.poll(async () => (await deliveryRatingStats()).points, { timeout: 10000 }).toBe(delivBefore.points + 1);

  // calificación: vendedor 5 · producto 3 · delivery 4 (botones 0..4 = 1..5 estrellas)
  await m.reload();
  await expect(m.getByRole('heading', { name: /Calificá tu experiencia/i })).toBeVisible({ timeout: 15000 });
  const stars = { Vendedor: 4, Producto: 2, Delivery: 3 };
  for (const [fila, idx] of Object.entries(stars)) {
    await m.locator('.flex-between', { hasText: fila }).locator('button').nth(idx).click();
  }
  await m.getByRole('button', { name: /Enviar calificación/i }).click();
  await expect(m.getByText(/Gracias por calificar/i)).toBeVisible({ timeout: 10000 });

  // el perfil queda CONSISTENTE con la tabla de reseñas (promedio y cantidad reales)
  await expect.poll(async () => (await storeRatingStats()).count, { timeout: 10000 })
    .toBe((await avgFromRatings('vendedor@repuestosaltoque.com.ar', ['SELLER', 'PRODUCT'])).count);
  const storeReal = await avgFromRatings('vendedor@repuestosaltoque.com.ar', ['SELLER', 'PRODUCT']);
  const storeAfter = await storeRatingStats();
  expect(storeAfter.avg).toBe(storeReal.avg);
  expect(storeAfter.count).toBeGreaterThanOrEqual(2); // vendedor + producto de esta corrida

  await expect.poll(async () => (await deliveryRatingStats()).count, { timeout: 10000 })
    .toBe((await avgFromRatings('repartidor@repuestosaltoque.com.ar', ['DELIVERY'])).count);
  const delivReal = await avgFromRatings('repartidor@repuestosaltoque.com.ar', ['DELIVERY']);
  const delivAfter = await deliveryRatingStats();
  expect(delivAfter.avg).toBe(delivReal.avg);
  expect(delivAfter.count).toBeGreaterThanOrEqual(1);

  // el repartidor VE su reputación en el panel (estrella + entregas)
  await d.reload();
  await expect(d.locator('.topbar .badge-yellow')).toContainText(String(delivAfter.avg), { timeout: 15000 });

  // el comercio VE sus puntos reales en el panel (el contador grande del header)
  await s.reload();
  await expect(s.locator('.h-md.text-yellow').first()).toHaveText(storeAfter.points.toLocaleString('es-AR'), { timeout: 15000 });

  await mc.close(); await sc.close(); await dc.close();
});

// La reputación ORDENA las cotizaciones: un comercio sin reseñas se muestra "Nuevo"
// y va al final, aunque su precio sea más barato.
test('comercio sin reseñas cotiza como "Nuevo" y ordena después del calificado', async ({ browser }) => {
  test.setTimeout(150000);
  const plate = uniquePlate();
  const desc = `PuntosOrden E2E ${Date.now()}`;
  const email = `e2e-store-${Date.now()}@rat.test`;

  // el test anterior garantiza reseñas del vendedor seed; defensa por si corre solo
  const seedStats = await storeRatingStats();
  test.skip(seedStats.count === 0, 'requiere que el vendedor seed tenga reseñas (corre puntos.spec completo)');

  // 1) alta de un comercio NUEVO desde el backoffice
  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  await a.getByRole('button', { name: /Alta de usuario/i }).click(); // sub-nav Alta (rediseño admin)
  await a.getByPlaceholder('Repuestos Centro').fill('E2E Nuevo Store');
  await a.getByPlaceholder('cuenta@email.com').fill(email);
  await pickAddress(a); // dirección obligatoria por autocompletado
  await a.getByRole('button', { name: /Crear usuario/i }).click();
  const box = a.locator('.float-notif', { hasText: 'Usuario creado' });
  await expect(box).toBeVisible({ timeout: 20000 });
  const pwd = (await box.locator('.text-yellow').innerText()).trim();

  // 2) el mecánico publica un trabajo
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  // 3) cotizan los dos: el calificado MÁS CARO, el nuevo MÁS BARATO
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('30000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.getByText(/Cotización enviada/i)).toBeVisible({ timeout: 10000 });

  const nc = await browser.newContext(); const n = await nc.newPage();
  await n.goto('/login');
  await n.fill('input[type="email"]', email);
  await n.fill('input[type="password"]', pwd);
  await n.getByRole('button', { name: /Ingresar/i }).click();
  await expect(n).toHaveURL(/\/comercio/, { timeout: 15000 });
  const nCard = n.locator('.card', { hasText: desc });
  await expect(nCard).toBeVisible({ timeout: 15000 });
  await nCard.getByRole('button', { name: /Cotizar/i }).click();
  await n.locator('input[inputmode="numeric"]').first().fill('20000');
  await n.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(n.getByText(/Cotización enviada/i)).toBeVisible({ timeout: 10000 });

  // snapshot honesto en la base: null para el nuevo, el promedio real para el calificado
  const qNew = await db().requestQuote.findFirst({ where: { request: { description: desc }, store: { email } } });
  expect(qNew.ratingSnapshot).toBeNull();
  const qOld = await db().requestQuote.findFirst({ where: { request: { description: desc }, store: { email: 'vendedor@repuestosaltoque.com.ar' } } });
  expect(Number(qOld.ratingSnapshot)).toBe(seedStats.avg);

  // 4) el mecánico cierra y compara: el calificado PRIMERO (con estrellas), el nuevo AL FINAL como "Nuevo"
  await m.bringToFront();
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  const cards = m.locator('.quote-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('30.000'); // el calificado, aunque sea más caro
  await expect(cards.first().locator('.stars')).toBeVisible();
  await expect(cards.first()).not.toContainText('Nuevo');
  await expect(cards.last()).toContainText('20.000'); // el nuevo, último pese al mejor precio
  await expect(cards.last()).toContainText('Nuevo');

  await mc.close(); await sc.close(); await nc.close(); await ac.close();
});
