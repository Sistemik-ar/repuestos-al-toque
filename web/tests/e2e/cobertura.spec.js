import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { zombieJobWindow, attachPhotosByPlate } from './db';

// Coverage de features sin red previa: reputación del comercio en el home,
// agrupación "Sin respuesta" (zombies), visualización de fotos del repuesto, y
// la incidencia "Nadie me atendió" del repartidor.

test('comercio: ve su reputación (nivel + puntos) en el home', async ({ page }) => {
  await login(page, 'vendedor@repuestosaltoque.com.ar');
  await expect(page).toHaveURL(/\/comercio/);
  // el badge sale de getMyReputation (puntos reales de ventas concretadas del seed)
  await expect(page.getByText('Puntos', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.rep-badge')).toBeVisible();
});

test('comercio: una cotización sin decisión por +24hs cae en "Sin respuesta"', async ({ browser }) => {
  test.setTimeout(90000);
  const plate = uniquePlate();
  const desc = `Zombie E2E ${Date.now()}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('input[inputmode="numeric"]').first().fill('25000');
  await card.getByRole('button', { name: /Enviar precio/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 });

  // la ventana cerró hace +24hs y el mecánico nunca decidió -> zombie
  await zombieJobWindow(plate);
  await s.reload();
  await s.getByRole('button', { name: /Enviadas/i }).click();
  await expect(s.getByRole('heading', { name: /Sin respuesta/i })).toBeVisible({ timeout: 15000 });
  await expect(s.locator('.card', { hasText: desc }).getByText(/Sin respuesta/i)).toBeVisible();

  await mc.close(); await sc.close();
});

test('comercio: ve el badge de fotos del repuesto en un pedido', async ({ browser }) => {
  test.setTimeout(90000);
  const plate = uniquePlate();
  const desc = `Foto E2E ${Date.now()}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);
  // el upload real va por Supabase (no está en local); sembramos las URLs para probar el display
  await attachPhotosByPlate(plate, ['https://example.com/p1.jpg', 'https://example.com/p2.jpg']);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.locator('i.fa-image')).toBeVisible();
  await expect(card.locator('.badge', { hasText: '2' })).toBeVisible();

  await mc.close(); await sc.close();
});

test('mecánico: la patente autocompleta el vehículo de un pedido anterior', async ({ page }) => {
  test.setTimeout(90000);
  const plate = uniquePlate();
  const desc = `Autofill E2E ${Date.now()}`;
  await login(page, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(page, desc, plate); // historial: Toyota Hilux 2019 · motor 1.4
  await publicarTrabajo(page);

  // nuevo pedido: tipear la patente conocida -> autocompleta marca y motor
  await page.goto('/mecanico/pedido');
  await page.getByPlaceholder('ABC123 o AB123CD').fill(plate);
  await expect(page.getByText(/Vehículo autocompletado/i)).toBeVisible({ timeout: 15000 });
  await expect(page.locator('select').first()).toHaveValue('Toyota');
  await expect(page.getByPlaceholder(/Multijet/i)).toHaveValue('1.4');
});

test('repartidor: "Nadie me atendió" registra la incidencia', async ({ browser }) => {
  test.setTimeout(120000);
  const plate = uniquePlate();
  const desc = `Incidencia E2E ${Date.now()}`;

  // pedido -> cotización -> elección -> pago (mismo camino que el reparto real)
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('input[inputmode="numeric"]').first().fill('20000');
  await card.getByRole('button', { name: /Enviar precio/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 });

  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  const jobId = new URL(m.url()).searchParams.get('id');
  await m.goto(`/api/mp/return?status=approved&external_reference=${encodeURIComponent('job::' + jobId)}`);

  // repartidor toma el viaje y avisa que no lo atendieron en el comercio
  const dc = await browser.newContext(); const d = await dc.newPage();
  await login(d, 'repartidor@repuestosaltoque.com.ar');
  const dCard = d.locator('.card', { hasText: desc }).first();
  await expect(dCard).toBeVisible({ timeout: 15000 });
  await dCard.getByRole('button', { name: /Tomar viaje/i }).click();
  const mine = d.locator('.card', { hasText: desc }).first();
  await mine.getByRole('button', { name: /Nadie me atendió/i }).click();
  await expect(d.getByText(/Incidencia registrada/i)).toBeVisible({ timeout: 10000 });

  await mc.close(); await sc.close(); await dc.close();
});
