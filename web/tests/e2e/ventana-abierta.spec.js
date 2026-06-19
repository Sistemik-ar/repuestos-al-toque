import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem, publicarTrabajo } from './helpers';
import { setSetting } from './db';

// Con el contador en 0 (sin contador) windowEndsAt queda null al publicar. El pedido publicado
// igual tiene que verlo y poder cotizarlo el comercio (el feed distingue por estado del job, no por el contador).
test('contador en 0: el pedido publicado sigue visible y cotizable para el comercio', async ({ browser }) => {
  test.setTimeout(90000);
  await setSetting('quoteWindowMin', '0');
  try {
    const desc = `SinContador E2E ${Date.now()}`;
    const plate = uniquePlate();
    const mc = await browser.newContext(); const m = await mc.newPage();
    await login(m, 'mecanico@repuestosaltoque.com.ar');
    await crearItem(m, desc, plate);
    await publicarTrabajo(m);

    const sc = await browser.newContext(); const s = await sc.newPage();
    await login(s, 'vendedor@repuestosaltoque.com.ar');
    const card = s.locator('.card', { hasText: desc });
    await expect(card).toBeVisible({ timeout: 15000 }); // visible aunque windowEndsAt sea null
    await card.getByRole('button', { name: /Cotizar/i }).click();
    await s.locator('input[inputmode="numeric"]').first().fill('30000');
    await s.getByRole('button', { name: /Enviar Cotización/i }).click();
    await expect(s.locator('.card', { hasText: desc })).toHaveCount(0, { timeout: 10000 }); // cotización aceptada
    await mc.close(); await sc.close();
  } finally {
    await setSetting('quoteWindowMin', '60'); // restaurar el default para no afectar otros tests
  }
});
