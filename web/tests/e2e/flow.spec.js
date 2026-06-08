import { test, expect } from '@playwright/test';

// Flujo completo contra la base real (necesita DB + seed). Usa 2 contextos: mecánico y vendedor.
async function login(page, email) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
}

test('pedido → cotización → cierre de ventana → elegir → pago (link MP)', async ({ browser }) => {
  // 1) Mecánico crea un pedido
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await expect(m).toHaveURL(/\/mecanico/);
  await m.goto('/mecanico/pedido');
  await m.locator('button:has-text("Toyota Hilux")').first().click(); // vehículo rápido
  await m.getByRole('button', { name: /Continuar/i }).click(); // a categoría
  await m.locator('text=Frenos').first().click(); // categoría -> paso 3
  await m.locator('textarea').first().fill('Pastillas de freno E2E');
  await m.getByRole('button', { name: /Continuar/i }).click(); // a urgencia
  await m.getByRole('button', { name: /Continuar/i }).click(); // a confirmar
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/cotizaciones\?id=/, { timeout: 15000 });
  const reqUrl = m.url();
  const reqId = new URL(reqUrl).searchParams.get('id');

  // 2) Vendedor cotiza ese pedido
  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await expect(s).toHaveURL(/\/comercio/);
  await s.getByRole('button', { name: /Cotizar/i }).first().click();
  await s.locator('input[inputmode="numeric"]').first().fill('39900');
  await s.getByRole('button', { name: /Enviar Cotización/i }).click();

  // 3) Mecánico cierra la ventana y elige
  await m.bringToFront();
  await m.getByRole('button', { name: /Cerrar y ver ofertas/i }).click();
  await expect(m.getByText(/Ofertas recibidas/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Elegir oferta/i }).first().click();
  await m.getByRole('button', { name: /Continuar al pago/i }).click();

  // 4) Pago: debe ofrecer pagar con Mercado Pago
  await expect(m).toHaveURL(/\/mecanico\/pago/);
  await expect(m.getByRole('button', { name: /Pagar con Mercado Pago/i })).toBeVisible();

  await mc.close();
  await sc.close();
});
