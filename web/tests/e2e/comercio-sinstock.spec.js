import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';

// "Sin stock" se persiste server-side: el pedido descartado no reaparece, ni siquiera en otro
// navegador/dispositivo (antes era estado de cliente y reaparecía al recargar).
test('comercio: "sin stock" persiste y no reaparece (cross-dispositivo)', async ({ browser }) => {
  const stamp = Date.now();
  const descA = `SinStockA E2E ${stamp}`, descB = `SinStockB E2E ${stamp}`;
  const mc = await browser.newContext(); const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, descA, uniquePlate()); await publicarTrabajo(m);
  await crearItem(m, descB, uniquePlate()); await publicarTrabajo(m);

  // el comercio marca "sin stock" el pedido A
  const sc = await browser.newContext(); const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  const cardA = s.locator('.card', { hasText: descA });
  await expect(cardA).toBeVisible({ timeout: 15000 });
  await cardA.getByRole('button', { name: /Sin stock/i }).click();
  await expect(s.locator('.card', { hasText: descA })).toHaveCount(0); // desaparece al instante

  // OTRO navegador/dispositivo (contexto nuevo): A sigue oculto, B se ve (prueba que el feed cargó)
  const sc2 = await browser.newContext(); const s2 = await sc2.newPage();
  await login(s2, 'vendedor@repuestosaltoque.com.ar');
  await expect(s2.locator('.card', { hasText: descB })).toBeVisible({ timeout: 15000 }); // feed cargado
  await expect(s2.locator('.card', { hasText: descA })).toHaveCount(0); // descartado server-side

  await mc.close(); await sc.close(); await sc2.close();
});
