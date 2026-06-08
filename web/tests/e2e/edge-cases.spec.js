import { test, expect } from '@playwright/test';

async function login(page, email, home) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  if (home) await expect(page).toHaveURL(home);
}

test('login con campos vacíos muestra error', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page.getByText(/Completá email y contraseña/i)).toBeVisible();
});

test('pago sin oferta elegida muestra aviso', async ({ page }) => {
  await login(page, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
  await page.goto('/mecanico/pago');
  await expect(page.getByText(/No hay una oferta elegida/i)).toBeVisible();
});

test('un comercio puede enviar varias opciones para la misma solicitud', async ({ browser }) => {
  const desc = `MultiOpcion E2E ${Date.now()}`;

  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
  await m.goto('/mecanico/pedido');
  await m.locator('button:has-text("Toyota Hilux")').first().click();
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.locator('text=Frenos').first().click();
  await m.locator('textarea').first().fill(desc);
  await m.getByRole('button', { name: /Continuar/i }).click(); // urgencia
  await m.getByRole('button', { name: /Continuar/i }).click(); // confirmar
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m).toHaveURL(/cotizaciones\?id=/, { timeout: 15000 });

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar', /\/comercio/);

  // Opción 1
  const pendCard = s.locator('.card', { hasText: desc });
  await expect(pendCard).toBeVisible({ timeout: 15000 });
  await pendCard.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('45000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();

  // Pasa a Cotizadas mostrando "1 opción" + permite agregar otra
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 }); // ya no en Pendientes
  await s.getByRole('button', { name: /Cotizadas/i }).click();
  const cotCard = s.locator('.card', { hasText: desc });
  await expect(cotCard.getByText(/1 opción/)).toBeVisible();

  // Opción 2 (alternativa más barata)
  await cotCard.getByRole('button', { name: /Agregar otra opción/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill('38000');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();
  await expect(s.locator('.card', { hasText: desc }).getByText(/2 opciones/)).toBeVisible({ timeout: 10000 });

  // El mecánico ve las 2 ofertas
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y ver ofertas/i }).click();
  await expect(m.getByText(/Ofertas recibidas \(2\)/i)).toBeVisible({ timeout: 15000 });

  await mc.close();
  await sc.close();
});
