'use client';
// Cliente del almacén compartido. Lee/escribe contra la API del servidor (la PC
// de Felipe) y hace polling para refrescar en vivo. Todos los celus comparten datos.
import { useEffect, useState } from 'react';

let cache = { requests: [], quotes: [] };
let started = false;

function notify() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('rat-db')); }

async function refresh() {
  try {
    const r = await fetch('/api/db', { cache: 'no-store' });
    cache = await r.json();
    notify();
  } catch (e) {}
}
function startPolling() {
  if (started || typeof window === 'undefined') return;
  started = true;
  refresh();
  setInterval(refresh, 1500);
}

// ---- Lectura sincrónica desde el cache (arranca polling al primer uso) ----
export function getRequests() { startPolling(); return cache.requests; }
export function getRequest(id) { startPolling(); return cache.requests.find((r) => r.id === id); }
export function getOpenRequests() { startPolling(); return cache.requests.filter((r) => r.status === 'open'); }
export function getQuotes(requestId) { startPolling(); return cache.quotes.filter((q) => q.requestId === requestId); }
export function storeQuotedRequestIds(storeName) {
  startPolling();
  return new Set(cache.quotes.filter((q) => q.storeName === storeName).map((q) => q.requestId));
}

// ---- Escritura (POST + refresh inmediato) ----
const ALIASES = { 'Repuestos Centro': 'Proveedor #12', 'Andina Parts': 'Distribuidor Centro', 'Patagonia Frenos': 'Zona Oeste Parts' };
function aliasFor(store) {
  if (ALIASES[store]) return ALIASES[store];
  let h = 0; for (const c of String(store)) h = (h * 31 + c.charCodeAt(0)) % 97;
  return 'Proveedor #' + (10 + (h % 80));
}

export async function addRequest(r) {
  const res = await fetch('/api/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) });
  const { id } = await res.json();
  await refresh();
  return id;
}
export async function addQuote(q) {
  const store = q.storeName || 'Vendedor';
  const quote = { rating: 4.8, zone: 'Centro', warranty: '6 meses', ...q, alias: aliasFor(store) };
  await fetch('/api/quotes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(quote) });
  await refresh();
}
export async function setRequestStatus(id, status) {
  await fetch('/api/status', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) });
  await refresh();
}
export async function updateRequest(id, patch) {
  await fetch('/api/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, patch }) });
  await refresh();
}

// ---- Identidad local (por dispositivo) ----
export function getClientId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem('rat_client');
  if (!id) { id = 'c' + Math.random().toString(36).slice(2, 9); localStorage.setItem('rat_client', id); }
  return id;
}
export function getSellerName() { return typeof window === 'undefined' ? null : localStorage.getItem('rat_seller'); }
export function setSellerName(n) { localStorage.setItem('rat_seller', n); }

// ---- Hooks reactivos ----
function useSub(getter) {
  const [val, setVal] = useState(getter);
  useEffect(() => {
    startPolling();
    const h = () => setVal(getter());
    h();
    window.addEventListener('rat-db', h);
    return () => window.removeEventListener('rat-db', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return val;
}
export function useRequests() { return useSub(getRequests); }
export function useQuotes(requestId) { return useSub(() => getQuotes(requestId)); }
