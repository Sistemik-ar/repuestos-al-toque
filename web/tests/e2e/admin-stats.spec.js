import { test, expect } from '@playwright/test';
import { login } from './helpers';
import { ensureCC, seedCreditSale } from './db';

// Coverage del refactor nuevo del admin: dashboard de Estadísticas, guardar Ajustes
// (comisión + tarifas), desactivar una cuenta corriente y abrir el detalle de reparto.

test.describe('Admin — refactor nuevo', () => {
  test('Estadísticas: métricas generales + tabla por comercio', async ({ page }) => {
    test.setTimeout(60000);
    await login(page, 'admin@repuestosaltoque.com.ar');
    await page.getByRole('button', { name: /Estadísticas/i }).click();
    await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();
    await expect(page.getByText('Período', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /90 días/i }).click();

    // tarjetas de la vista General (siempre presentes, con o sin datos)
    for (const m of ['Ventas (GMV)', 'Comisión RAT', 'Pedidos concretados', 'Ticket promedio', 'Envíos cobrados']) {
      await expect(page.getByText(m, { exact: true })).toBeVisible({ timeout: 15000 });
    }

    // sub-tab "Comercios" (las pill-tabs de stats, no el item del sidebar homónimo)
    await page.locator('.pill-tabs').getByRole('button', { name: 'Comercios' }).click();
    await expect(page.getByRole('heading', { name: 'Por comercio' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('columnheader', { name: /Cotizó/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /CSV/i }).first()).toBeVisible();
  });

  test('Ajustes: guardar comisión y tarifas persiste (toasts de confirmación)', async ({ page }) => {
    await login(page, 'admin@repuestosaltoque.com.ar');
    await page.getByRole('button', { name: /Ajustes/i }).click();
    await expect(page.getByRole('heading', { name: 'Comisión y recargo' })).toBeVisible();

    // comisión
    const comField = page.locator('.field', { hasText: /Comisión de la plataforma/i }).locator('input');
    await comField.fill('10');
    // el botón "Guardar" de comisión (scopeado a su card para no chocar con "Guardar tarifas")
    await page.locator('.card', { hasText: 'Comisión y recargo' }).getByRole('button', { name: /Guardar/ }).click();
    await expect(page.getByText(/Configuración guardada/i)).toBeVisible({ timeout: 10000 });

    // tarifas de envío (re-guarda las bandas existentes; el toast confirma)
    await page.getByRole('button', { name: /Guardar tarifas/i }).click();
    await expect(page.getByText(/Tarifas guardadas/i)).toBeVisible({ timeout: 10000 });
  });

  test('Cuenta corriente: el admin desactiva una relación activa', async ({ page }) => {
    await ensureCC(); // deja mecanico↔Repuestos Centro como ACTIVE
    await login(page, 'admin@repuestosaltoque.com.ar');
    await page.getByRole('button', { name: /Cuenta corriente/i }).click();
    await expect(page.getByRole('heading', { name: /Solicitudes de Cuenta Corriente/i })).toBeVisible();
    await page.getByPlaceholder(/Buscar por mecánico o comercio/i).fill('Repuestos Centro');
    const desactivar = page.getByRole('button', { name: /^Desactivar$/ }).first();
    await expect(desactivar).toBeVisible({ timeout: 10000 });
    await desactivar.click();
    await expect(page.getByText(/Relación desactivada/i)).toBeVisible({ timeout: 10000 });
  });

  test('la sección queda en la URL y sobrevive el reload (F5)', async ({ page }) => {
    await login(page, 'admin@repuestosaltoque.com.ar');
    await page.getByRole('button', { name: /Estadísticas/i }).click();
    await expect(page).toHaveURL(/[?&]sec=stats/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible({ timeout: 15000 });
    // Usuarios -> Alta de usuario queda como ?u=alta y también sobrevive el F5
    await page.locator('.rat-navitem', { hasText: 'Usuarios' }).click(); // item del sidebar (no el bottomnav oculto)
    await page.getByRole('button', { name: /Alta de usuario/i }).click();
    await expect(page).toHaveURL(/[?&]u=alta/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Alta de usuario' })).toBeVisible({ timeout: 15000 });
  });

  test('Pedidos: el admin abre el detalle de reparto (Ver reparto -> Historial)', async ({ page }) => {
    await seedCreditSale({ creditAccount: false }); // venta entregada -> orden con hasTrip
    await login(page, 'admin@repuestosaltoque.com.ar');
    await page.getByRole('button', { name: /Pedidos/i }).click();
    await expect(page.getByRole('heading', { name: 'Pedidos', exact: true })).toBeVisible();
    // ordenar por "Reparto" (col num -> desc al primer click) trae los que tienen viaje a la pág. 1
    await page.getByRole('columnheader', { name: /Reparto/i }).click();
    const verReparto = page.getByRole('button', { name: /Ver reparto/i }).first();
    await expect(verReparto).toBeVisible({ timeout: 15000 });
    await verReparto.click();
    await expect(page.getByRole('heading', { name: /Historial de reparto/i })).toBeVisible({ timeout: 10000 });
  });
});
