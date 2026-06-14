import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { restoreSeedPassword, restoreSeedEmail } from './db';

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';

// Corre al final (zz-) y restaura pass + email seed, para no afectar a los demás specs que loguean como vendedor.
test.afterAll(async () => { await restoreSeedEmail(); await restoreSeedPassword([VENDEDOR]); });

test('el admin setea una contraseña temporal a un comercio y este entra con ella', async ({ browser }) => {
  test.setTimeout(90000);
  const tempPass = 'temporal' + (Date.now() % 1000);

  // ADMIN: en la tabla Usuarios, "Pass" sobre el comercio -> ingresa la temporal en el prompt
  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  a.on('dialog', (d) => d.accept(tempPass)); // responde el window.prompt de la contraseña
  const row = a.locator('tr', { hasText: VENDEDOR });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: /Pass/i }).click();
  // el banner muestra la credencial lista para pasar
  await expect(a.getByText(/Contraseña temporal lista/i).first()).toBeVisible({ timeout: 10000 });
  await expect(a.getByText(tempPass).first()).toBeVisible(); // el banner muestra la pass

  // EL COMERCIO entra con la pass temporal nueva
  const sc = await browser.newContext(); const s = await sc.newPage();
  await s.goto('/login');
  await s.fill('input[type="email"]', VENDEDOR);
  await s.fill('input[type="password"]', tempPass);
  await s.getByRole('button', { name: /Ingresar/i }).click();
  await expect(s).toHaveURL(/\/comercio/, { timeout: 15000 }); // entró a su panel

  await ac.close(); await sc.close();
});

test('el admin cambia el email de un comercio', async ({ browser }) => {
  test.setTimeout(60000);
  const nuevo = `vendedor-edit-${Date.now()}@rat.test`;
  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  a.on('dialog', (d) => d.accept(nuevo)); // responde el window.prompt del email
  const row = a.locator('tr', { hasText: VENDEDOR });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: /Email/i }).click();
  await expect(a.getByText(/Email actualizado/i)).toBeVisible({ timeout: 10000 });
  await expect(a.locator('tr', { hasText: nuevo })).toBeVisible({ timeout: 10000 }); // la tabla refleja el nuevo email
  // (el afterAll restaura el email seed)
  await ac.close();
});
