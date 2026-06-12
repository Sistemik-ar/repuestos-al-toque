import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { db } from './db';

// Ciclo de Cuenta Corriente con estado inicial DETERMINÍSTICO (se resetea por DB).
// La suite termina con la CC ACTIVA (estado que usa el equipo para probar).
test.describe.configure({ mode: 'serial' });

const STORE = 'Repuestos Centro';

test.beforeAll(async () => {
  const p = db();
  const mech = await p.user.findUnique({ where: { email: 'mecanico@repuestosaltoque.com.ar' } });
  const store = await p.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' } });
  await p.creditAccount.deleteMany({ where: { mechanicId: mech.id, storeId: store.id } });
});

test.afterAll(async () => {
  // pase lo que pase, la CC del equipo queda ACTIVA
  const p = db();
  const mech = await p.user.findUnique({ where: { email: 'mecanico@repuestosaltoque.com.ar' } });
  const store = await p.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' } });
  await p.creditAccount.upsert({
    where: { mechanicId_storeId: { mechanicId: mech.id, storeId: store.id } },
    update: { adminStatus: 'APPROVED', storeStatus: 'APPROVED', active: true, disabledAt: null },
    create: { mechanicId: mech.id, storeId: store.id, adminStatus: 'APPROVED', storeStatus: 'APPROVED', active: true },
  });
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
