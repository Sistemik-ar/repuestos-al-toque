import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-cambiar');
const SECTION_ROLE = { '/mecanico': 'MECHANIC', '/comercio': 'STORE', '/admin': 'ADMIN', '/repartidor': 'DELIVERY' };
const HOME = { MECHANIC: '/mecanico', STORE: '/comercio', ADMIN: '/admin', DELIVERY: '/repartidor' };

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const section = Object.keys(SECTION_ROLE).find((p) => pathname === p || pathname.startsWith(p + '/'));
  if (!section) return NextResponse.next();

  const token = req.cookies.get('rat_session')?.value;
  if (!token) return NextResponse.redirect(new URL('/login', req.url));
  try {
    const { payload } = await jwtVerify(token, secret);
    const need = SECTION_ROLE[section];
    if (payload.role !== need) return NextResponse.redirect(new URL(HOME[payload.role] || '/login', req.url));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}

export const config = {
  matcher: ['/mecanico/:path*', '/comercio/:path*', '/admin/:path*', '/repartidor/:path*'],
};
