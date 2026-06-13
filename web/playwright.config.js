import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 40000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
    // El modo prueba de pagos (atajo de confirmación sin MP real) lo controla el harness E2E,
    // NO el .env: en producción MP_TEST_AMOUNT va apagado. Así el suite es autónomo y reproducible.
    // DATABASE_URL se propaga si está en el entorno (npm run e2e:local apunta a la DB local);
    // si no, el server usa el .env (DB remota).
    env: {
      MP_TEST_AMOUNT: process.env.MP_TEST_AMOUNT || '10',
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      ...(process.env.AUTH_SECRET ? { AUTH_SECRET: process.env.AUTH_SECRET } : {}),
    },
  },
});
