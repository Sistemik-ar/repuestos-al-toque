// Copia la demo estática (../demo) a public/demo e inyecta <base href="/demo/">
// para que los links relativos funcionen servida bajo /demo. Corre en pre-dev/pre-build.
import fs from 'node:fs';
import path from 'node:path';

const src = path.join(process.cwd(), '..', 'demo');
const dest = path.join(process.cwd(), 'public', 'demo');

if (!fs.existsSync(src)) { console.warn('sync-demo: no existe ../demo, salteo'); process.exit(0); }

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });

for (const f of fs.readdirSync(dest)) {
  if (f.endsWith('.html')) {
    const fp = path.join(dest, f);
    let s = fs.readFileSync(fp, 'utf8');
    if (!s.includes('<base ')) s = s.replace('<head>', '<head>\n  <base href="/demo/">');
    fs.writeFileSync(fp, s);
  }
}
console.log('sync-demo: demo copiada a public/demo (con <base href="/demo/">)');
