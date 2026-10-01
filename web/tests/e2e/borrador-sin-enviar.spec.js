import { test, expect } from '@playwright/test';
import { login, uniquePlate, crearItem } from './helpers';
import { db } from './db';

// En prod, varios mecánicos cargaban el repuesto y se iban creyendo que el pedido ya estaba enviado:
// quedaba en borrador, los comercios no lo veían y terminaba cancelado (a veces "desestimando" el
// único repuesto sin saber que eso cancelaba el pedido entero). Estos tests cuidan las señales.

test('después de agregar el repuesto queda claro que todavía no se envió', async ({ page: m }) => {
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, `SinEnviar E2E ${Date.now()}`, uniquePlate());
  await expect(m.getByText(/Todavía no se envió/i)).toBeVisible();
  // "Solicitar presupuesto" es la acción principal: primer botón de la pantalla
  const pantalla = m.locator('.form-narrow', { hasText: 'Repuesto agregado' });
  await expect(pantalla.getByRole('button').first()).toContainText(/solicitar presupuesto/i);
});

test('un borrador olvidado se ve "Sin enviar" en el inicio y lleva a enviarlo', async ({ page: m }) => {
  const plate = uniquePlate();
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, `Olvidado E2E ${Date.now()}`, plate);
  await m.goto('/mecanico'); // se va sin tocar "Solicitar presupuesto"

  await expect(m.getByText(/Tenés pedidos/i)).toBeVisible({ timeout: 15000 });
  const card = m.locator('a.card', { hasText: plate });
  await expect(card.getByText(/Sin enviar/i)).toBeVisible();
  await card.click();
  await expect(m.getByText(/Pedido sin enviar/i)).toBeVisible({ timeout: 15000 });
  await m.getByRole('button', { name: /Solicitar presupuesto/i }).click();
  await expect(m.getByText(/Los comercios están cotizando/i)).toBeVisible({ timeout: 15000 });
});

test('en un borrador, "Quitar" el único repuesto avisa que se cancela todo el pedido', async ({ page: m }) => {
  const plate = uniquePlate();
  const desc = `UnicoItem E2E ${Date.now()}`;
  await login(m, 'mecanico@repuestosaltoque.com.ar');
  await crearItem(m, desc, plate);
  const job = await db().job.findFirst({ where: { plate }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  await m.goto(`/mecanico/trabajo?id=${job.id}`);

  const quitar = m.locator('.card', { hasText: desc }).getByRole('button', { name: /^.?\s*Quitar$/ });
  await expect(quitar).toBeVisible({ timeout: 15000 });

  // 1) el aviso dice que se cancela el pedido completo; si lo rechaza, no pasa nada
  let mensaje = '';
  m.once('dialog', (d) => { mensaje = d.message(); d.dismiss(); });
  await quitar.click();
  await expect.poll(() => mensaje).toMatch(/CANCELA EL PEDIDO COMPLETO/);
  expect((await db().job.findUnique({ where: { id: job.id }, select: { status: true } })).status).toBe('DRAFT');

  // 2) si confirma, se cancela y queda registrado quién y cómo
  m.once('dialog', (d) => d.accept());
  await quitar.click();
  await expect.poll(async () => (await db().job.findUnique({ where: { id: job.id }, select: { status: true } })).status, { timeout: 10000 }).toBe('CANCELLED');
  const log = await db().auditLog.findFirst({ where: { entityId: job.id, action: 'JOB_CANCELLED' } });
  expect(log?.payload).toMatchObject({ by: 'mechanic', via: 'ultimo_item_desestimado' });
});
