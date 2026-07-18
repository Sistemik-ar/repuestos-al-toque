// Tests de integración: corren contra el Postgres LOCAL de docker-compose.test.yml, no contra mocks.
// Van aparte de los unitarios porque necesitan la DB levantada:
//
//   npm run db:local:up && npm run db:local:setup
//   npm run test:integration
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.js'],
    fileParallelism: false, // comparten la misma base: nada de correr archivos en paralelo
    testTimeout: 20000,
  },
  resolve: {
    alias: { '@': process.cwd() },
  },
});
