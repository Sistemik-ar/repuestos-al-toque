import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Serial: los 3 pasos usan la MISMA relación CC (mecánico seed <-> vendedor seed).
// La suite termina con la CC ACTIVA (estado que usa el equipo para probar).
test.describe.configure({ mode: 'serial' });

const STORE = 'Repuestos Centro';

test('si la CC está activa, el admin puede desactivarla', async ({ browser }) => {
  const ac = await browser.newContext();
  const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  // esperar a que el panel cargue; si NO existe relación CC todavía (base reseteada), no hay nada que desactivar
  await expect(a.getByRole('heading', { name: 'Alta de usuario' })).toBeVisible({ timeout: 15000 });
  const row = a.locator('tr', { hasText: STORE }).filter({ hasText: 'Taller' }).first();
  const existe = await row.isVisible({ timeout: 8000 }).catch(() => false);
  if (existe) {
    const desactivar = row.getByRole('button', { name: /^Desactivar$/ });
    if (await desactivar.count()) {
      await desactivar.click();
      await expect(row.getByText(/Desactivada/)).toBeVisible({ timeout: 10000 });
    }
  }
  await ac.close();
});

test('rechazo: el comercio rechaza y el mecánico ve "Rechazada"', async ({ browser }) => {
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await m.goto('/mecanico/cuentas');
  const card = m.locator('.card', { hasText: STORE }).first();
  await card.getByRole('button', { name: /Solicitar/i }).click();
  await expect(card.getByText(/Pendiente de validación/i)).toBeVisible({ timeout: 10000 });

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await s.getByRole('button', { name: /^Rechazar$/ }).first().click();

  await m.reload();
  await expect(m.locator('.card', { hasText: STORE }).first().getByText(/Rechazada/i)).toBeVisible({ timeout: 10000 });

  await mc.close(); await sc.close();
});

test('aprobación: solicitar → admin valida → comercio aprueba → "Aprobada"', async ({ browser }) => {
  const mc = await browser.newContext();
  const m = await mc.newPage();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await m.goto('/mecanico/cuentas');
  const card = m.locator('.card', { hasText: STORE }).first();
  await card.getByRole('button', { name: /Solicitar/i }).click();
  await expect(card.getByText(/Pendiente de validación/i)).toBeVisible({ timeout: 10000 });

  const ac = await browser.newContext();
  const a = await ac.newPage();
  await login(a, 'admin@repuestosaltoque.com.ar');
  await a.getByRole('button', { name: /^Validar$/ }).first().click();
  await expect(a.getByRole('button', { name: /^Validar$/ })).toHaveCount(0, { timeout: 10000 });

  const sc = await browser.newContext();
  const s = await sc.newPage();
  await login(s, 'vendedor@repuestosaltoque.com.ar');
  await s.getByRole('button', { name: /^Aprobar$/ }).first().click();

  await m.reload();
  await expect(m.locator('.card', { hasText: STORE }).first().getByText(/Aprobada/i)).toBeVisible({ timeout: 10000 });

  await mc.close(); await ac.close(); await sc.close();
});
