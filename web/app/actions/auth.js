'use server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createSession, clearSession } from '@/lib/session';

export async function loginAction(email, password) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !password) return { error: 'Completá email y contraseña.' };

  let user;
  try {
    user = await prisma.user.findUnique({ where: { email: e } });
  } catch (err) {
    return { error: 'No se pudo conectar con la base. Reintentá en un momento.' };
  }

  if (!user || !user.passwordHash) return { error: 'Cuenta no encontrada. El alta es por invitación.' };
  if (user.status === 'SUSPENDED') return { error: 'Tu cuenta está suspendida.' };

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return { error: 'Contraseña incorrecta.' };

  await createSession(user);
  return { ok: true, role: user.role };
}

export async function logoutAction() {
  clearSession();
  return { ok: true };
}
