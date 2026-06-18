'use server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createSession, clearSession } from '@/lib/session';

// Freno de fuerza bruta: máximo de intentos fallidos por email en una ventana corta.
// En memoria (best-effort en serverless: por instancia); el lockout real vendría con un
// store compartido, pero esto ya corta el barrido de contraseñas desde un cliente.
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const fails = new Map(); // email -> { count, first }

function tooMany(email) {
  const f = fails.get(email);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { fails.delete(email); return false; }
  return f.count >= MAX_FAILS;
}
function noteFail(email) {
  const f = fails.get(email);
  if (!f || Date.now() - f.first > WINDOW_MS) fails.set(email, { count: 1, first: Date.now() });
  else f.count += 1;
}

export async function loginAction(email, password) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !password) return { error: 'Completá email y contraseña.' };
  if (tooMany(e)) return { error: 'Demasiados intentos. Esperá unos minutos y volvé a probar.' };

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email: e } });
  } catch (err) {
    return { error: 'No se pudo conectar con la base. Reintentá en un momento.' };
  }

  if (!user || !user.passwordHash) { noteFail(e); return { error: 'Cuenta no encontrada. El alta es por invitación.' }; }
  if (user.status === 'SUSPENDED') return { error: 'Tu cuenta está suspendida.' };

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) { noteFail(e); return { error: 'Contraseña incorrecta.' }; }

  fails.delete(e); // login exitoso limpia el contador
  prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {}); // registra el ingreso (no bloquea el login)
  await createSession(user);
  return { ok: true, role: user.role };
}

export async function logoutAction() {
  clearSession();
  return { ok: true };
}
