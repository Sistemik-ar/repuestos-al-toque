import { test, expect } from '@playwright/test';

async function login(page, email, home) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  await expect(page).toHaveURL(home);
}

// Doble aprobación: mecánico solicita -> admin valida -> comercio aprueba -> queda aprobada.
test('cuenta corriente: solicitar → admin valida → comercio aprueba', async ({ browser }) => {
  // 1) Mecánico solicita
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
  await m.goto('/mecanico/cuentas');
  await m.getByRole('button', { name: /Solicitar/i }).first().click();
  await expect(m.getByText(/Pendiente de validación/i).first()).toBeVisible();

  // 2) Admin valida
  const ac = await browser.newContext();
  const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar', /\/admin/);
  await a.getByRole('button', { name: /^Validar$/ }).first().click();
  await expect(a.getByRole('button', { name: /^Validar$/ })).toHaveCount(0, { timeout: 10000 });

  // 3) Comercio aprueba
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar', /\/comercio/);
  await s.getByRole('button', { name: /^Aprobar$/ }).first().click();

  // 4) Mecánico ve "Aprobada"
  await m.reload();
  await expect(m.getByText(/Aprobada/i).first()).toBeVisible({ timeout: 10000 });

  await mc.close(); await ac.close(); await sc.close();
});
