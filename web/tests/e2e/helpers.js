import { expect } from '@playwright/test';

export async function login(page, email) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'repuestos123');
  await page.getByRole('button', { name: /Ingresar/i }).click();
  // esperar a que el login efectivamente redirija (si no, la próxima navegación rebota a /login)
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });
}

// patente única por corrida para no agrupar con trabajos de tests anteriores
export const uniquePlate = () => 'AB' + String(Date.now() % 1000).padStart(3, '0') + 'CD';

// Alta admin: la dirección es un autocompletado obligatorio (Nominatim). Escribe y elige la 1ra
// sugerencia de Bariloche. Timeout amplio porque depende del servicio externo.
export async function pickAddress(page, query = 'Mitre 100') {
  await page.getByPlaceholder(/Escribí la calle/i).fill(query);
  const opt = page.locator('.address-suggest button').first();
  await expect(opt).toBeVisible({ timeout: 25000 });
  await opt.click();
  await expect(page.getByText(/Dirección validada en Bariloche/i)).toBeVisible({ timeout: 10000 });
}

// arma un trabajo con 1 ítem y deja la pantalla en "¿seguir comprando?"
export async function crearItem(m, desc, plate) {
  await m.goto('/mecanico/pedido');
  await m.locator('button:has-text("Toyota Hilux")').first().click(); // setea marca/modelo/año
  await m.getByPlaceholder('ABC123 o AB123CD').fill(plate);
  await m.getByPlaceholder(/Multijet/i).fill('1.4'); // motorización (obligatoria)
  await m.getByRole('button', { name: /Continuar/i }).click();
  await m.locator('text=Frenos').first().click();
  await m.locator('textarea').first().fill(desc);
  await m.getByRole('button', { name: /Continuar/i }).click(); // urgencia
  await m.getByRole('button', { name: /Continuar/i }).click(); // confirmar
  await m.getByRole('button', { name: /Enviar pedido/i }).click();
  await expect(m.getByText(/Repuesto agregado/i)).toBeVisible({ timeout: 30000 });
}

// el comercio cotiza un ítem (desde Pendientes) y cierra el modal
export async function cotizar(s, desc, price) {
  const card = s.locator('.card', { hasText: desc });
  await expect(card).toBeVisible({ timeout: 15000 });
  // cotización rápida inline (precio + "Enviar precio") del nuevo panel del comercio
  await card.locator('input[inputmode="numeric"]').first().fill(price);
  await card.getByRole('button', { name: /Enviar precio/i }).click();
  await expect(s.getByText(/Precio enviado|Cotización enviada/i).first()).toBeVisible({ timeout: 10000 });
}

// publica el trabajo y queda en /mecanico/trabajo
export async function publicarTrabajo(m) {
  await m.getByRole('button', { name: /Eso es todo/i }).click();
  await expect(m).toHaveURL(/\/mecanico\/trabajo\?id=/, { timeout: 15000 });
}
