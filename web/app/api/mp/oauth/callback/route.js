// Vuelta del OAuth de Mercado Pago: el comercio autorizó su cuenta y MP nos manda un `code`.
// Lo canjeamos por sus tokens y los guardamos en su perfil para poder cobrarle con split (su cuenta
// recibe el repuesto y la plataforma retiene su comisión). El comercio debe estar logueado.
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { mpExchangeCode, mpOAuthConfigured } from '@/lib/mercadopago';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const proto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  const host = req.headers.get('host');
  const back = (ok) => Response.redirect(new URL(`/comercio/perfil?mp=${ok ? 'ok' : 'error'}`, `${proto}://${host}`));
  try {
    const s = await getSession();
    if (!s || s.role !== 'STORE' || !mpOAuthConfigured() || !code) return back(false);
    const redirectUri = `${proto}://${host}/api/mp/oauth/callback`; // debe coincidir EXACTO con el de inicio
    const tok = await mpExchangeCode({ code, redirectUri });
    await prisma.storeProfile.update({
      where: { userId: s.id },
      data: {
        mpAccessToken: tok.access_token,
        mpRefreshToken: tok.refresh_token || null,
        mpUserId: tok.user_id != null ? String(tok.user_id) : null,
        mpTokenExpires: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
        mpLinked: true,
      },
    });
    return back(true);
  } catch {
    return back(false);
  }
}
