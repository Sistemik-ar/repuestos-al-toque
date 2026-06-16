import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { restoreSeedPassword, restoreSeedEmail, reactivateSeed } from './db';

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';

// Corre al final (zz-) y restaura pass + email + estado seed, para no afectar a los demás specs.
test.afterAll(async () => { await restoreSeedEmail(); await restoreSeedPassword([VENDEDOR]); await reactivateSeed([VENDEDOR]); });

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

  await restoreSeedPassword([VENDEDOR]); // restaurar ya (no esperar al afterAll) para no romper los tests siguientes
  await ac.close(); await sc.close();
});

test('el admin edita un comercio y le cambia el email (modal Editar)', async ({ browser }) => {
  test.setTimeout(60000);
  const nuevo = `vendedor-edit-${Date.now()}@rat.test`;
  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  const row = a.locator('tr', { hasText: VENDEDOR });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: /Editar/i }).click();
  const modal = a.locator('.modal');
  await expect(modal.getByRole('heading', { name: /Editar usuario/i })).toBeVisible({ timeout: 10000 });
  await modal.locator('input[type="email"]').fill(nuevo); // cambia el email en el form
  await modal.getByRole('button', { name: /Guardar cambios/i }).click();
  await expect(a.getByText(/Usuario actualizado/i)).toBeVisible({ timeout: 10000 });
  await expect(a.locator('tr', { hasText: nuevo })).toBeVisible({ timeout: 10000 }); // la tabla refleja el nuevo email
  await restoreSeedEmail(); // restaurar ya para no romper los tests siguientes
  await ac.close();
});

test('el admin suspende un comercio: no puede entrar; al reactivarlo, sí', async ({ browser }) => {
  test.setTimeout(60000);
  const ac = await browser.newContext(); const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  const row = a.locator('tr', { hasText: VENDEDOR });
  await expect(row).toBeVisible({ timeout: 15000 });

  // suspender
  await row.getByRole('button', { name: /Suspender/i }).click();
  await expect(a.locator('tr', { hasText: VENDEDOR }).getByText(/SUSPENDED/)).toBeVisible({ timeout: 10000 });

  // el comercio NO puede entrar
  const sc = await browser.newContext(); const s = await sc.newPage();
  await s.goto('/login');
  await s.fill('input[type="email"]', VENDEDOR);
  await s.fill('input[type="password"]', 'repuestos123');
  await s.getByRole('button', { name: /Ingresar/i }).click();
  await expect(s.getByText(/suspendida/i)).toBeVisible({ timeout: 10000 });
  await expect(s).not.toHaveURL(/\/comercio/);

  // reactivar y ahora SÍ entra
  await a.locator('tr', { hasText: VENDEDOR }).getByRole('button', { name: /Reactivar/i }).click();
  await expect(a.locator('tr', { hasText: VENDEDOR }).getByText(/ACTIVE/)).toBeVisible({ timeout: 10000 });
  await s.getByRole('button', { name: /Ingresar/i }).click();
  await expect(s).toHaveURL(/\/comercio/, { timeout: 15000 });

  await ac.close(); await sc.close();
});
