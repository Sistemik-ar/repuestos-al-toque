import { test, expect } from '@playwright/test';
import { login } from './helpers';

// La sección Estadísticas del admin tiene que cargar (getAdminStats resuelve sin error).
// Si getAdminStats rompe (p.ej. una columna que falta en la DB), queda en "Cargando estadísticas…" para siempre.
test('admin: la sección Estadísticas carga sin error', async ({ page }) => {
  await login(page, 'admin@repuestosaltoque.com.ar');
  await page.goto('/admin?sec=stats');
  await expect(page.getByRole('button', { name: 'General' })).toBeVisible({ timeout: 10000 }); // renderizó la sección
  // getAdminStats resolvió: el loading desaparece
  await expect(page.getByText(/Cargando estadísticas/i)).toHaveCount(0, { timeout: 15000 });
});
