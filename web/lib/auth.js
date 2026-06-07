'use client';
// Sesión placeholder (pre-backend). En producción esto lo reemplaza Auth.js:
// el rol viene de la cuenta, no se elige. Acá usamos un set de cuentas demo
// para poder navegar la app real con el comportamiento "rol según cuenta".
const KEY = 'rat_session';

export const ROLE_HOME = { admin: '/admin', seller: '/comercio', mechanic: '/mecanico', courier: '/repartidor' };

// Cuentas de prueba (onboarding manual). La contraseña no se valida todavía.
export const DEMO_ACCOUNTS = {
  'admin@repuestosaltoque.com.ar': { role: 'admin', name: 'Administración' },
  'mecanico@repuestosaltoque.com.ar': { role: 'mechanic', name: 'Taller Patagonia' },
  'vendedor@repuestosaltoque.com.ar': { role: 'seller', name: 'Repuestos Centro' },
  'repartidor@repuestosaltoque.com.ar': { role: 'courier', name: 'Diego R.' },
};

export function login(email) {
  const a = DEMO_ACCOUNTS[String(email || '').trim().toLowerCase()];
  if (!a) return null;
  const s = { email: email.trim().toLowerCase(), ...a };
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
  return s;
}
export function getSession() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function logout() {
  if (typeof window !== 'undefined') localStorage.removeItem(KEY);
}
