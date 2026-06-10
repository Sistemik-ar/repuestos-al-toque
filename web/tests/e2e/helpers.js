import { expect } from '@playwright/test';

export async function login(page, email) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
}

// patente única por corrida para no agrupar con trabajos de tests anteriores
export const uniquePlate = () => 'AB' + String(Date.now() % 1000).padStart(3, '0') + 'CD';

// arma un trabajo con 1 ítem y deja la pantalla en "¿seguir comprando?"
export async function crearItem(m, desc, plate) {
  await m.goto('/mecanico/pedido');
  await m.locator('button:has-text("Toyota Hilux")').first().click();
  await m.getByPlaceholder('ABC123 o AB123CD').fill(plate);
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.locator('text=Frenos').first().click();
  await m.locator('textarea').first().fill(desc);
  await m.getByRole('button', { name: /Continuar/i }).click(); // urgencia
  await m.getByRole('button', { name: /Continuar/i }).click(); // confirmar
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m.getByText(/Repuesto agregado/i)).toBeVisible({ timeout: 15000 });
}

// publica el trabajo y queda en /mecanico/trabajo
export async function publicarTrabajo(m) {
  await m.getByRole('button', { name: /Eso es todo/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/, { timeout: 15000 });
}
