import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

// Bug: "Sin stock" era solo estado de cliente y reaparecía al recargar. Ahora se persiste (localStorage).
test('comercio: marcar "sin stock" no reaparece al recargar', async ({ browser }) => {
  const desc = `SinStock E2E ${Date.now()}`;
  const plate = uniquePlate();
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  await publicarTrabajo(m);

  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Sin stock/i }).click();
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0); // desaparece al marcarlo

  await s.reload(); // antes reaparecía acá (estado de cliente se reseteaba)
  await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 15000 }); // sigue oculto

  await mc.close(); await sc.close();
});
