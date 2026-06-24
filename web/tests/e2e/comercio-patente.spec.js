import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

// El comercio necesita la PATENTE del vehículo para cotizar bien (no revela la identidad del mecánico).
test('comercio: ve la patente del vehículo en el pedido y al cotizar', async ({ browser }) => {
  const desc = `Patente E2E ${Date.now()}`;
  const plate = uniquePlate();
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card).toContainText(plate); // la patente figura en la tarjeta
  // y también en el modal de cotizar (donde ingresan el precio)
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await expect(s.locator('.modal')).toContainText(plate);

  await mc.close(); await sc.close();
});
