// Sesión real (JWT firmado en cookie httpOnly). Reemplaza el placeholder.
// Se puede migrar a Auth.js más adelante sin cambiar la UX.
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'rat_session';
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-cambiar');

export async function createSession(user) {
  const token = await new SignJWT({ id: user.id, email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

// Cache corto de estados (evita 1 query extra por action en cada poll)
const statusCache = new Map(); // userId -> { status, at }
const STATUS_TTL = 30 * 1000;

export async function getSession() {
  const c = cookies().get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret);
    // un usuario SUSPENDIDO queda fuera al instante, aunque su JWT siga vigente (dura 7 días)
    const cached = statusCache.get(payload.id);
    let status = cached && Date.now() - cached.at < STATUS_TTL ? cached.status : null;
    if (!status) {
      const { prisma } = await import('@/lib/db');
      const u = await prisma.user.findUnique({ where: { id: payload.id }, select: { status: true } });
      status = u?.status || 'MISSING';
      statusCache.set(payload.id, { status, at: Date.now() });
    }
    if (status !== 'ACTIVE') return null;
    return payload;
  } catch {
    return null;
  }
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export function invalidateStatusCache(userId) {
  statusCache.delete(userId);
}
