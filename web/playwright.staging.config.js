import { defineConfig, devices } from '@playwright/test';

// Smoke contra el deploy real de staging (Neon). NO levanta server local ni toca la base directo:
// solo navega la URL pública y loguea con las cuentas seed. Timeouts amplios por el cold start de Vercel.
export default defineConfig({
  testDir: './tests/staging',
  timeout: 90000,
  expect: { timeout: 25000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://repuestos-al-toque-staging.vercel.app',
    headless: true,
    trace: 'on-first-retry',
    navigationTimeout: 45000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
