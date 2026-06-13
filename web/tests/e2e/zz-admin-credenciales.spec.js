import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { restoreSeedPassword } from './db';

const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';

// Corre al final (zz-) y restaura la pass seed, para no afectar a los demás specs que loguean como vendedor.
test.afterAll(async () => { await restoreSeedPassword([VENDEDOR]); });

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
