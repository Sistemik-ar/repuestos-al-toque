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
    // El modo prueba de pagos lo activa MP_TEST_ACCESS_TOKEN (token de sandbox, en el .env): con él
    // mpIsTest() es true y corre el atajo de confirmación sin cobrar plata real. En producción ese
    // token NO va seteado. DATABASE_URL/AUTH_SECRET se propagan si están en el entorno (DB local).
    env: {
      ...(process.env.MP_TEST_ACCESS_TOKEN ? { MP_TEST_ACCESS_TOKEN: process.env.MP_TEST_ACCESS_TOKEN } : {}),
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
      ...(process.env.AUTH_SECRET ? { AUTH_SECRET: process.env.AUTH_SECRET } : {}),
    },
  },
});
