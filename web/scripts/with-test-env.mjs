// Corre cualquier comando con las variables de .env.test cargadas (DB local, etc.).
// Uso: node scripts/with-test-env.mjs <comando> [args...]
// Ej:  node scripts/with-test-env.mjs npx playwright test
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const envFile = path.join(process.cwd(), '.env.test');
if (!fs.existsSync(envFile)) {
  console.error('Falta .env.test (configurá la DB local: ver docker-compose.test.yml).');
  process.exit(1);
}

const env = { ...process.env };
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error('Falta el comando a ejecutar.'); process.exit(1); }
const res = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(res.status ?? 1);
