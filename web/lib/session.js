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

export async function getSession() {
  const c = cookies().get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret);
    return payload;
  } catch {
    return null;
  }
}

export function clearSession() {
  cookies().delete(COOKIE);
}
