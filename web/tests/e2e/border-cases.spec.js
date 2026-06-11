import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

test('desestimar un ítem lo saca del pago del trabajo', async ({ browser }) => {
  const stamp = Date.now();
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');

  // trabajo con 2 ítems
  await crearItem(m, `Borde1 E2E ${stamp}`, plate);
  await m.getByRole('button', { name: /Agregar otro repuesto/i }).click();
  await m.locator('text=Frenos').first().click();
  await m.locator('textarea').first().fill(`Borde2 E2E ${stamp}`);
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m.getByText(/2 ítems en este trabajo/i)).toBeVisible({ timeout: 15000 });
  await publicarTrabajo(m);

  // vendedor cotiza SOLO el ítem 1
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: `Borde1 E2E ${stamp}` });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('30000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: `Borde1 E2E ${stamp}` })).toHaveCount(0, { timeout: 10000 });

  // mecánico: cierra, elige ítem 1, DESESTIMA ítem 2
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 });
  await m.locator('.card', { hasText: `Borde1 E2E ${stamp}` }).getByRole('link', { name: /Ver cotizaciones/i }).click();
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);

  m.on('dialog', (d) => d.accept());
  await m.locator('.card', { hasText: `Borde2 E2E ${stamp}` }).getByRole('button', { name: /Desestimar/i }).click();
  await expect(m.locator('.card', { hasText: `Borde2 E2E ${stamp}` }).getByText(/Cancelado/)).toBeVisible({ timeout: 10000 });

  // el pago es solo por el ítem elegido
  await expect(m.getByRole('button', { name: /Generar link de pago \(1 ítem\)/i })).toBeVisible();

  await mc.close();
  await sc.close();
});

test('no se puede crear otro pedido con la patente de un trabajo en curso', async ({ browser }) => {
  const stamp = Date.now();
  const plate = uniquePlate();
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');

  await crearItem(m, `Dup1 E2E ${stamp}`, plate);
  await publicarTrabajo(m); // queda OPEN (cotizando)

  // mismo vehículo y misma patente, trabajo nuevo -> error claro (banner persistente)
  await crearItem(m, `Dup2 E2E ${stamp}`, plate).catch(() => {});
  await expect(m.getByText(/ya tiene el Trabajo #/i)).toBeVisible({ timeout: 15000 });

  await mc.close();
});

// El flujo del trabajo en pantalla de celular
test.describe('mobile (viewport celular)', () => {
  test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });

  test('mobile: armar y publicar un trabajo', async ({ page }) => {
    await login(page, 'mecanico@repuestosaltoque.com.ar');
    await crearItem(page, `Mobile E2E ${Date.now()}`, uniquePlate());
    await expect(page.getByRole('button', { name: /Eso es todo/i })).toBeVisible();
    await publicarTrabajo(page);
    await expect(page.getByText(/Los comercios están cotizando/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Cerrar y elegir/i })).toBeVisible();
  });

  test('mobile: el repartidor ve sus secciones', async ({ page }) => {
    await login(page, 'repartidor@repuestosaltoque.com.ar');
    await expect(page.getByRole('heading', { name: /Pedidos disponibles/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Mis entregas/i })).toBeVisible();
  });
});
