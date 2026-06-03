// Almacén compartido del lado del servidor (corre en la PC de Felipe).
// Todos los celus que entran por la red comparten estos datos. Persiste en un
// archivo para sobrevivir reinicios. Es el puente hasta tener Supabase.
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), '.data');
const FILE = path.join(DIR, 'db.json');
let db = null;

function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { db = { requests: [], quotes: [] }; }
  return db;
}
function save() {
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } catch (e) {}
}

export function getDb() { return load(); }

export function addRequest(r) {
  const d = load();
  const id = String(1042 + d.requests.length);
  d.requests.unshift({ id, status: 'open', createdAt: Date.now(), ...r });
  save();
  return id;
}
export function addQuote(q) {
  const d = load();
  d.quotes.push({ id: 'Q' + Date.now() + Math.floor(Math.random() * 99), createdAt: Date.now(), ...q });
  save();
}
export function setStatus(id, status) {
  const d = load();
  const r = d.requests.find((x) => x.id === id);
  if (r) r.status = status;
  save();
}
export function resetAll() { db = { requests: [], quotes: [] }; save(); }
