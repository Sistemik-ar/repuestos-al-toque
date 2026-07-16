import { defineConfig, devices } from '@playwright/test';

// Puerto configurable: si el 3000 está ocupado por OTRA app (reuseExistingServer la reusaría
// y los tests correrían contra la app equivocada), correr con E2E_PORT=3100.
const PORT = process.env.E2E_PORT || 3000;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 40000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || `http://localhost:${PORT}`,
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -H 0.0.0.0 -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120000,
    // El modo prueba de pagos lo activa MP_TEST_ACCESS_TOKEN (token de sandbox, en el .env): con él
    // mpIsTest() es true y corre el atajo de confirmación sin cobrar plata real. En producción ese
    // token NO va seteado. DATABASE_URL/AUTH_SECRET se propagan si están en el entorno (DB local).
    env: {
      ...(process.env.MP_TEST_ACCESS_TOKEN ? { MP_TEST_ACCESS_TOKEN: process.env.MP_TEST_ACCESS_TOKEN } : {}),
      // credenciales dummy de la app Marketplace: habilitan el flujo de vinculación (split) en los
      // tests sin pegarle a MP. La autorización real con MP no se ejecuta en E2E.
      ...(process.env.MP_CLIENT_ID ? { MP_CLIENT_ID: process.env.MP_CLIENT_ID } : {}),
      ...(process.env.MP_CLIENT_SECRET ? { MP_CLIENT_SECRET: process.env.MP_CLIENT_SECRET } : {}),
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      ...(process.env.AUTH_SECRET ? { AUTH_SECRET: process.env.AUTH_SECRET } : {}),
      // Avisos por WhatsApp en modo prueba: habilita la feature sin llamar a Meta (viene del .env.test)
      ...(process.env.WA_TEST_MODE ? { WA_TEST_MODE: process.env.WA_TEST_MODE } : {}),
    },
  },
});
