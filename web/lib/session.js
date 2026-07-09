// Sesión real (JWT firmado en cookie httpOnly). Reemplaza el placeholder.
// Se puede migrar a Auth.js más adelante sin cambiar la UX.
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'rat_session';
// En el deploy real (Vercel) AUTH_SECRET es OBLIGATORIO: con el default de desarrollo
// cualquiera podría forjar sesiones. Mejor caer ruidosamente en el deploy que correr inseguro.
// (Local con `npm run start` —el harness E2E— no exige, por eso se chequea VERCEL y no NODE_ENV.)
if (process.env.VERCEL && !process.env.AUTH_SECRET) {
  throw new Error('Falta AUTH_SECRET en producción (las sesiones serían forjables).');
}
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
      // Latido de presencia: esta rama corre a lo sumo 1 vez cada 30s por usuario (por instancia),
      // así "en línea / última conexión" del admin no cuesta un write por request.
      if (status === 'ACTIVE') await prisma.user.update({ where: { id: payload.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
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
