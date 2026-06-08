import { test, expect } from '@playwright/test';

async function login(page, email, home) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  if (home) await expect(page).toHaveURL(home);
}

const toNum = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);

// Verifica que el monto enviado a Mercado Pago (= total del desglose) incluya TODOS los subítems.
test('el total del pago = suma de repuesto + comisión + envío', async ({ browser }) => {
  const desc = `Monto E2E ${Date.now()}`;
  const PRICE = 45000;

  // 1) Mecánico crea el pedido
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar', /\/mecanico/);
  await m.goto('/mecanico/pedido');
  await m.locator('button:has-text("Toyota Hilux")').first().click();
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.locator('text=Frenos').first().click();
  await m.locator('textarea').first().fill(desc);
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m).toHaveURL(/cotizaciones\?id=/, { timeout: 15000 });

  // 2) Vendedor cotiza ese pedido con un precio conocido
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar', /\/comercio/);
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: /Cotizar/i }).click();
  await s.locator('input[inputmode="numeric"]').first().fill(String(PRICE));
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();

  // 3) Mecánico cierra, elige y va al pago
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y ver ofertas/i }).click();
  await expect(m.getByText(/Ofertas recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Continuar al pago/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/pago/);

  // 4) Leer el desglose y verificar la suma
  const detalle = m.locator('.card', { hasText: 'Total' });
  await expect(detalle.getByText(/Total/)).toBeVisible();
  const text = await detalle.innerText();
  const montos = [...text.matchAll(/\$\s?([\d.]+)/g)].map((x) => toNum(x[1]));
  expect(montos.length).toBeGreaterThanOrEqual(4); // repuesto, comisión, envío, total

  const total = montos[montos.length - 1];
  const subitems = montos.slice(0, -1);
  const suma = subitems.reduce((a, b) => a + b, 0);

  expect(montos[0]).toBe(PRICE); // repuesto = precio cotizado
  expect(subitems).toContain(5000); // envío mínimo (sin coordenadas en el seed)
  expect(suma).toBe(total); // TOTAL = suma de todos los subítems

  await mc.close();
  await sc.close();
});
