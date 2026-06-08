import { test, expect } from '@playwright/test';

async function login(page, email, home) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(home);
}

// Serial dentro del archivo (fullyParallel:false) para no pisar la misma relación CC.
test.describe.configure({ mode: 'serial' });

test('rechazo: el comercio rechaza y el mecánico ve "Rechazada"', async ({ browser }) => {
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
  await m.goto('/mecanico/cuentas');
  await m.getByRole('button', { name: /Solicitar/i }).first().click();
  await expect(m.getByText(/Pendiente de validación/i).first()).toBeVisible();

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar', /\/comercio/);
  await s.getByRole('button', { name: /^Rechazar$/ }).first().click();

  await m.reload();
  await expect(m.getByText(/Rechazada/i).first()).toBeVisible({ timeout: 10000 });

  await mc.close(); await sc.close();
});

test('aprobación: solicitar → admin valida → comercio aprueba → "Aprobada"', async ({ browser }) => {
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
  await m.goto('/mecanico/cuentas');
  // tras el rechazo previo, vuelve a poder solicitar
  await m.getByRole('button', { name: /Solicitar/i }).first().click();
  await expect(m.getByText(/Pendiente de validación/i).first()).toBeVisible();

  const ac = await browser.newContext();
  const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar', /\/admin/);
  await a.getByRole('button', { name: /^Validar$/ }).first().click();
  await expect(a.getByRole('button', { name: /^Validar$/ })).toHaveCount(0, { timeout: 10000 });

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar', /\/comercio/);
  await s.getByRole('button', { name: /^Aprobar$/ }).first().click();

  await m.reload();
  await expect(m.getByText(/Aprobada/i).first()).toBeVisible({ timeout: 10000 });

  await mc.close(); await ac.close(); await sc.close();
});
