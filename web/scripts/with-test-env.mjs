// Corre cualquier comando con las variables de .env.test cargadas (DB local, etc.).
// Uso: node scripts/with-test-env.mjs <comando> [args...]
// Ej:  node scripts/with-test-env.mjs npx playwright test
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

if (!fs.existsSync(path.join(process.cwd(), '.env.test'))) {
  console.error('Falta .env.test (configurá la DB local: ver docker-compose.test.yml).');
  process.exit(1);
}

// Carga .env primero (tokens reales: MP sandbox, etc.) y .env.test ENCIMA (overrides
// locales: DB en Docker, AUTH_SECRET). Así los tests usan el MP_TEST_ACCESS_TOKEN real
// sin duplicar secretos en .env.test (que sí se commitea).
const env = { ...process.env };
for (const file of ['.env', '.env.test']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error('Falta el comando a ejecutar.'); process.exit(1); }
const res = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(res.status ?? 1);
