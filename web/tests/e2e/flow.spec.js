import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

// Flujo completo del TRABAJO contra la base real (necesita DB + seed).
test('trabajo: pedido → cotización → elegir → link de pago del trabajo', async ({ browser }) => {
  const desc = `Flujo E2E ${Date.now()}`;
  const plate = uniquePlate();

  // 1) Mecánico arma y publica el trabajo
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await expect(m).toHaveURL(/\/mecanico/);
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  // 2) Vendedor cotiza ese ítem
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await expect(s).toHaveURL(/\/comercio/);
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('input[inputmode="numeric"]').first().fill('39900');
  await card.getByRole('button', { name: /Enviar precio/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 }); // cotización confirmada

  // 3) Mecánico: cierra la ventana del trabajo y elige la oferta del ítem
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y elegir/i }).click();
  await expect(m.getByRole('button', { name: /Cerrar y elegir/i })).toHaveCount(0, { timeout: 10000 }); // ventana cerrada efectiva
  await m.getByRole('link', { name: /Ver cotizaciones/i }).first().click();
  await expect(m).toHaveURL(/\/mecanico\/cotizaciones\?id=.*job=/);
  await expect(m.getByText(/Cotizaciones recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Confirmar elección/i }).click();

  // 4) De vuelta en el trabajo: generar el link de pago agrupado
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/);
  await m.getByRole('button', { name: /Generar link de pago/i }).click();
  await expect(m.getByRole('link', { name: /Mandar al dueño/i })).toBeVisible({ timeout: 20000 });

  await mc.close();
  await sc.close();
});
