import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { expireJobWindow, backdateJobSelection, storeRatingStats } from './db';

// Procesos completos: expiración de ventana, cancelación por no pago,
// y el ciclo entero de reparto con PINs + calificaciones + historial.

test('ventana vencida: revela ofertas si las hay, o permite reintentar', async ({ browser }) => {
  const stamp = Date.now();
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');

  // caso A: CON cotización -> al vencer se revela y se puede elegir
  await crearItem(m, `Vence1 E2E ${stamp}`, plate);
  await publicarTrabajo(m);
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: `Vence1 E2E ${stamp}` });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('25000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: `Vence1 E2E ${stamp}` })).toHaveCount(0, { timeout: 10000 });

  await expireJobWindow(plate); // pasa el tiempo
  await m.reload();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0); // ventana ya no corre
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await expect(m.getByRole('button', { name: /Elegir oferta/i }).first()).toBeEnabled(); // revelado

  // el vendedor ya no lo ve en Pendientes (ventana cerrada)
  await s.reload();
  await expect(s.locator('.card', { hasText: `Vence1 E2E ${stamp}` })).toHaveCount(0);

  // caso B: SIN cotizaciones -> "No llegaron ofertas" + Reintentar reabre la ventana del trabajo
  const plate2 = 'CD' + String((stamp + 7) % 1000).padStart(3, '0') + 'XY';
  await crearItem(m, `Vence2 E2E ${stamp}`, plate2);
  await publicarTrabajo(m);
  await expireJobWindow(plate2);
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/No llegaron ofertas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Reintentar/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y ver ofertas/i })).toBeVisible({ timeout: 10000 }); // ventana reabierta
  // y el vendedor vuelve a verlo en Pendientes
  await s.reload();
  await expect(s.locator('.card', { hasText: `Vence2 E2E ${stamp}` })).toBeVisible({ timeout: 15000 });

  await mc.close(); await sc.close();
});

test('si no paga en 24hs: trabajo CANCELADO para el mecánico y "no pagó" para el vendedor', async ({ browser }) => {
  const stamp = Date.now();
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, `NoPago E2E ${stamp}`, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: `NoPago E2E ${stamp}` });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('15000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: `NoPago E2E ${stamp}` })).toHaveCount(0, { timeout: 10000 });

  // mecánico elige y genera el link... pero nunca paga
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  await m.getByRole('button', { name: /Generar link de pago/i }).click();
  await expect(m.getByRole('link', { name: /Mandar al dueño/i })).toBeVisible({ timeout: 20000 });

  await backdateJobSelection(plate); // pasan 25hs

  // mecánico: el dashboard lo muestra en Cancelados y el trabajo queda bloqueado
  await m.goto('/mecanico');
  await expect(m.getByRole('heading', { name: /^Cancelados$/ })).toBeVisible({ timeout: 15000 });
  await m.locator('.card', { hasText: plate }).first().click();
  await expect(m.getByText(/Trabajo cancelado/i)).toBeVisible({ timeout: 10000 });
  await expect(m.getByRole('button', { name: /Generar link de pago/i })).toHaveCount(0); // sin pagar un cancelado

  // vendedor: la cotización queda "Cancelado · no pagó"
  await s.reload();
  await s.getByRole('button', { name: /Cotizadas/i }).click();
  await expect(s.locator('.card', { hasText: `NoPago E2E ${stamp}` }).getByText(/Cancelado · no pagó/i)).toBeVisible({ timeout: 10000 });

  await mc.close(); await sc.close();
});

test('reparto completo con PINs + calificación + historial', async ({ browser }) => {
  test.setTimeout(150000);
  const stamp = Date.now();
  const plate = uniquePlate();
  const desc = `Reparto E2E ${stamp}`;

  // 1) compra completa (pedido → cotización → elegir)
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
  await s.locator('input[inputmode="numeric"]').first().fill('20000');
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

  // 2) pago: simulado por el MISMO camino real del retorno de Mercado Pago
  await m.goto(`/api/mp/return?status=approved&external_reference=${encodeURIComponent('job::' + jobId)}`);
  await m.goto(`/mecanico/trabajo?id=${jobId}`);
  await expect(m.getByText(/Trabajo pagado/i)).toBeVisible({ timeout: 15000 });

  // 3) repartidor toma el pedido y avisa llegada al comercio
  const dc = await browser.newContext();
  const d = await dc.newPage();
  await login(d, 'repartidor@repuestosaltoque.com.ar');
  const dCard = d.locator('.card', { hasText: desc }).first();
  await expect(dCard).toBeVisible({ timeout: 15000 });
  await dCard.getByRole('button', { name: /Tomar pedido/i }).click();
  const miCard = d.locator('.card', { hasText: desc }).first();
  await expect(miCard.getByText(/Mostrale este PIN al vendedor/i)).toBeVisible({ timeout: 15000 });
  const pickupPin = (await miCard.locator('.h-lg').innerText()).replace(/\D/g, '');
  expect(pickupPin).toHaveLength(4);
  await miCard.getByRole('button', { name: /Llegué al comercio/i }).click();

  // 4) vendedor: ve la llegada, PIN incorrecto rechazado, PIN correcto confirma retiro
  await s.reload();
  await s.getByRole('button', { name: /Concretadas/i }).click();
  const vCard = s.locator('.card', { hasText: desc }).first();
  await expect(vCard.getByText(/El repartidor está en tu local/i)).toBeVisible({ timeout: 15000 });
  await vCard.getByPlaceholder('PIN').fill('0000');
  await vCard.getByRole('button', { name: /Confirmar retiro/i }).click();
  await expect(s.getByText(/PIN incorrecto/i)).toBeVisible({ timeout: 10000 });
  await vCard.getByPlaceholder('PIN').fill(pickupPin);
  await vCard.getByRole('button', { name: /Confirmar retiro/i }).click();
  await expect(vCard.getByText(/Retirado · en camino/i)).toBeVisible({ timeout: 15000 });

  // 5) mecánico: ítem en camino, tiene su PIN de entrega
  await m.goto(`/mecanico/trabajo?id=${jobId}`);
  await m.locator('.card', { hasText: desc }).getByRole('link', { name: /Ver detalle y seguimiento/i }).click();
  await expect(m.getByText(/Tu PIN de entrega/i)).toBeVisible({ timeout: 15000 });
  const dropPin = (await m.locator('.h-lg.text-yellow').innerText()).replace(/\D/g, '');
  expect(dropPin).toHaveLength(4);

  // 6) repartidor: llega al taller, el mecánico ve el aviso, entrega con PIN
  await d.reload();
  const enCamino = d.locator('.card', { hasText: desc }).first();
  await enCamino.getByRole('button', { name: /Llegué al taller/i }).click();
  await expect(m.getByText(/llegó a tu taller/i)).toBeVisible({ timeout: 15000 }); // aviso en vivo (polling)
  await enCamino.getByPlaceholder('PIN').fill(dropPin);
  await enCamino.getByRole('button', { name: /Confirmar entrega/i }).click();
  await expect(d.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 15000 }); // salió de Mis entregas

  // 7) mecánico califica vendedor/producto/delivery -> sube la reputación del comercio
  const before = await storeRatingStats();
  await m.reload();
  await expect(m.getByText(/Entregado/i).first()).toBeVisible({ timeout: 15000 }); // timeline al final
  await expect(m.getByRole('heading', { name: /Calificá tu experiencia/i })).toBeVisible();
  for (const fila of ['Vendedor', 'Producto', 'Delivery']) {
    await m.locator('.flex-between', { hasText: fila }).locator('button').nth(4).click(); // 5 estrellas
  }
  await m.getByRole('button', { name: /Enviar calificación/i }).click();
  await expect(m.getByText(/Gracias por calificar/i)).toBeVisible({ timeout: 10000 });
  // la escritura de la reseña puede tardar un instante en verse en la base -> poll
  await expect.poll(async () => (await storeRatingStats()).count, { timeout: 10000 }).toBeGreaterThan(before.count);

  // 8) historial: el vendedor ve la venta "Entregado al mecánico"
  await s.reload();
  await s.getByRole('button', { name: /Concretadas/i }).click();
  await expect(s.locator('.card', { hasText: desc }).getByText(/Entregado al mecánico/i)).toBeVisible({ timeout: 15000 });

  await mc.close(); await sc.close(); await dc.close();
});
