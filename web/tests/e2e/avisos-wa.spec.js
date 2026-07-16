import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { waCodeFor, waGuardCodeFor, waOptOut, waReset, waDeleteGuards } from './db';

// Avisos por WhatsApp (WA_TEST_MODE: no se le pega a Meta; el código se lee de la DB).
const VENDEDOR = 'vendedor@repuestosaltoque.com.ar';
const MECANICO = 'mecanico@repuestosaltoque.com.ar';

test.afterAll(async () => {
  await waReset(VENDEDOR).catch(() => {});
  await waReset(MECANICO).catch(() => {});
  await waDeleteGuards('E2E Guardia').catch(() => {});
});

// Comercio: configura el número, verifica con el código y queda activo.
test('comercio: verificación del número de punta a punta', async ({ page }) => {
  await waReset(VENDEDOR);
  await login(page, VENDEDOR);
  await page.goto('/comercio/perfil');
  await expect(page.getByRole('heading', { name: 'Avisos por WhatsApp' })).toBeVisible({ timeout: 15000 });

  // estado 1: número con validación argentina
  await page.locator('#waPhone').fill('294 415 2823');
  await expect(page.getByText('Formato correcto')).toBeVisible();
  await page.getByRole('button', { name: /Verificar mi número/i }).click();

  // estado 2: código de 6 dígitos (lo generó el server; lo leemos de la DB)
  await expect(page.getByText('Revisá tu WhatsApp')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.sent-to')).toContainText('+54 9 294 415 2823');
  const code = await waCodeFor(VENDEDOR);
  expect(code).toHaveLength(6);
  await page.locator('.code-box').first().click();
  await page.keyboard.type(code, { delay: 50 });

  // estado 3: verificado y activo
  await expect(page.getByText('+54 9 294 •••• 823')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Verificado el')).toBeVisible();
  await expect(page.getByText('Recibir avisos', { exact: true })).toBeVisible();
  await expect(page.getByText(/Así se ve el aviso/i)).toBeVisible();

  // aviso de prueba (en modo test se marca enviado)
  await page.getByRole('button', { name: /aviso de prueba/i }).click();
  await expect(page.getByText(/Aviso de prueba enviado/i)).toBeVisible({ timeout: 10000 });
});

// Comercio: respondió BAJA -> estado de baja con reactivación instantánea.
test('comercio: estado BAJA y reactivación', async ({ page }) => {
  await waReset(VENDEDOR);
  await login(page, VENDEDOR);
  await page.goto('/comercio/perfil');
  await page.locator('#waPhone').fill('2944152823');
  await page.getByRole('button', { name: /Verificar mi número/i }).click();
  await expect(page.getByText('Revisá tu WhatsApp')).toBeVisible({ timeout: 10000 });
  const code = await waCodeFor(VENDEDOR);
  await page.locator('.code-box').first().click();
  await page.keyboard.type(code, { delay: 50 });
  await expect(page.getByText('+54 9 294 •••• 823')).toBeVisible({ timeout: 10000 });

  await waOptOut(VENDEDOR); // lo que haría el webhook al recibir "BAJA"
  await page.reload();
  await expect(page.getByText(/Desactivaste los avisos respondiendo BAJA/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: /Reactivar avisos/i }).click();
  await expect(page.getByText('Recibir avisos', { exact: true })).toBeVisible({ timeout: 10000 });
});

// Mecánico: la misma sección aparece en su perfil (patrón reutilizable).
test('mecánico: la sección de avisos está en su perfil', async ({ page }) => {
  await waReset(MECANICO);
  await login(page, MECANICO);
  await page.goto('/mecanico/perfil');
  await expect(page.getByRole('heading', { name: 'Avisos por WhatsApp' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/cuando te cotizan un repuesto/i)).toBeVisible();
});

// Admin: alta de número de guardia + verificación inline + kill switch.
test('admin: número de guardia y kill switch global', async ({ page }) => {
  const NAME = `E2E Guardia ${Date.now()}`;
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=whatsapp');
  await expect(page.getByRole('heading', { name: /Números de guardia/ })).toBeVisible({ timeout: 15000 });

  // alta -> queda pendiente con el código enviado
  await page.getByRole('button', { name: /Agregar número/i }).first().click();
  const modal = page.locator('.modal');
  await modal.getByPlaceholder(/Jorge/).fill(NAME);
  await modal.locator('.phone-wrap input').fill('294 461 0374');
  await modal.getByRole('button', { name: /Enviar código y agregar/i }).click();
  const row = page.locator('.gd-row', { hasText: NAME });
  await expect(row.getByText('Pendiente')).toBeVisible({ timeout: 10000 });

  // verificación inline con el código real
  const code = await waGuardCodeFor(NAME);
  expect(code).toHaveLength(6);
  await row.locator('.gd-verify input').fill(code);
  await expect(row.getByText('Verificado')).toBeVisible({ timeout: 10000 });

  // kill switch: pausar -> banner persistente -> reanudar
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Pausar todos los avisos/i }).click();
  await expect(page.getByText(/Todos los avisos están pausados/i)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Reanudar avisos/i }).click();
  await expect(page.getByText(/Todos los avisos están pausados/i)).toHaveCount(0, { timeout: 10000 });
});
