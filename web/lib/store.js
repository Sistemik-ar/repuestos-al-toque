'use client';
// Almacén compartido en el navegador (localStorage). Sin mocks: los pedidos y
// cotizaciones los genera el usuario. Se comparte entre pestañas del mismo equipo
// (mecánico/comercio). El backend real será Supabase más adelante.
import { useEffect, useState } from 'react';

const KEY = 'rat_db_v1';
const empty = { requests: [], quotes: [] };

function read() {
  if (typeof window === 'undefined') return empty;
  try { return JSON.parse(localStorage.getItem(KEY)) || empty; } catch { return empty; }
}
function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new Event('rat-db'));
}

const ALIASES = { 'Repuestos Centro': 'Proveedor #12', 'Andina Parts': 'Distribuidor Centro', 'Patagonia Frenos': 'Zona Oeste Parts' };

export function getRequests() { return read().requests; }
export function getRequest(id) { return read().requests.find((r) => r.id === id); }
export function getOpenRequests() { return read().requests.filter((r) => r.status === 'open'); }

export function addRequest(r) {
  const db = read();
  const n = 1042 + db.requests.length;
  const id = String(n);
  db.requests.unshift({ id, status: 'open', createdAt: Date.now(), ...r });
  write(db);
  return id;
}
export function setRequestStatus(id, status) {
  const db = read();
  const r = db.requests.find((x) => x.id === id);
  if (r) r.status = status;
  write(db);
}

export function getQuotes(requestId) { return read().quotes.filter((q) => q.requestId === requestId); }
export function addQuote(q) {
  const db = read();
  const store = q.storeName || 'Repuestos Centro';
  db.quotes.push({
    id: 'Q' + Date.now() + Math.floor(Math.random() * 99),
    createdAt: Date.now(),
    alias: ALIASES[store] || 'Proveedor #' + (10 + Math.floor(Math.random() * 80)),
    storeName: store,
    rating: q.rating ?? 4.8,
    zone: q.zone || 'Centro',
    warranty: q.warranty || '6 meses',
    ...q,
  });
  write(db);
}
export function quotesByStore(storeName) {
  const db = read();
  const ids = new Set(db.quotes.filter((q) => q.storeName === storeName).map((q) => q.requestId));
  return db.requests.filter((r) => ids.has(r.id));
}
export function storeQuotedRequestIds(storeName) {
  return new Set(read().quotes.filter((q) => q.storeName === storeName).map((q) => q.requestId));
}

export function resetAll() { write({ requests: [], quotes: [] }); }

// ---- Hooks reactivos ----
function useDb(selector) {
  const [val, setVal] = useState(undefined);
  useEffect(() => {
    const load = () => setVal(selector());
    load();
    window.addEventListener('rat-db', load);
    window.addEventListener('storage', load);
    return () => { window.removeEventListener('rat-db', load); window.removeEventListener('storage', load); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return val;
}
export function useRequests() { return useDb(getRequests) || []; }
export function useRequest(id) { return useDb(() => getRequest(id)); }
export function useQuotes(requestId) { return useDb(() => getQuotes(requestId)) || []; }
