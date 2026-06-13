import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Responsive + salud de consola en las pantallas principales de cada rol.
// - Sin scroll horizontal (el clásico que rompe mobile) en ningún viewport.
// - El CTA principal de cada pantalla visible y tocable.
// - Cero errores de consola (los warnings de React en dev no aparecen en build de prod).

const VIEWPORTS = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'Pixel 7', width: 412, height: 915 },
  { name: 'iPad', width: 768, height: 1024 },
  { name: 'laptop 1366', width: 1366, height: 768 },
  { name: 'desktop 1920', width: 1920, height: 1080 },
];

// pantallas por rol: [ruta, login con, texto que debe verse]
const SCREENS = [
  { path: '/', user: null, mustSee: /Ingresar/i },
  { path: '/login', user: null, mustSee: /Ingresar/i },
  { path: '/mecanico', user: 'mecanico@repuestosaltoque.com.ar', mustSee: /Nuevo pedido|Hola/i },
  { path: '/mecanico/pedido', user: 'mecanico@repuestosaltoque.com.ar', mustSee: /patente|vehículo/i },
  { path: '/comercio', user: 'vendedor@repuestosaltoque.com.ar', mustSee: /Solicitudes/i },
  { path: '/repartidor', user: 'repartidor@repuestosaltoque.com.ar', mustSee: /Entregas/i },
  { path: '/admin', user: 'admin@repuestosaltoque.com.ar', mustSee: /Usuarios|Backoffice|Resumen/i },
];

for (const vp of VIEWPORTS) {
  test(`${vp.name} (${vp.width}px): sin overflow horizontal ni errores de consola`, async ({ browser }) => {
    test.setTimeout(120000);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(`${page.url()}: ${msg.text()}`); });

    let logged = null;
    for (const sc of SCREENS) {
      if (sc.user && logged !== sc.user) { await login(page, sc.user); logged = sc.user; }
      await page.goto(sc.path);
      await expect(page.getByText(sc.mustSee).first()).toBeVisible({ timeout: 15000 });
      // sin scroll horizontal: el ancho del documento no supera el viewport (+1px de tolerancia)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow horizontal en ${sc.path} @ ${vp.name}`).toBeLessThanOrEqual(1);
    }

    // Filtramos ruido benigno: 404 de favicon/manifest y el aborto de prefetch RSC de Next
    // ("Failed to fetch RSC payload... Falling back to browser navigation") que ocurre cuando
    // el test navega muy rápido entre páginas — Next cae a navegación normal y carga igual.
    const realErrors = consoleErrors.filter((e) => !/favicon|manifest|RSC payload|Failed to fetch/i.test(e));
    expect(realErrors, `errores de consola: ${realErrors.join(' | ')}`).toHaveLength(0);
    await ctx.close();
  });
}
