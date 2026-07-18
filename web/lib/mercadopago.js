// Mercado Pago.
// - Cobro CENTRALIZADO (default): la plata entra a la cuenta de Jorge (MP_ACCESS_TOKEN); él le paga
//   a vendedores y repartidores aparte.
// - Split de pagos (Marketplace, opcional): si el comercio vinculó su MP por OAuth, el cobro entra a
//   SU cuenta y la plataforma retiene su comisión (marketplace_fee). Requiere una app Marketplace en
//   MP: MP_CLIENT_ID + MP_CLIENT_SECRET. Sin esas vars, el split queda deshabilitado (todo centralizado).

const MP_API = 'https://api.mercadopago.com';
const MP_AUTH = 'https://auth.mercadopago.com';

// ¿Está configurada la app Marketplace (OAuth)? Sin esto, no se puede vincular ningún comercio.
export function mpOAuthConfigured() {
  return !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET);
}

// URL a la que mandamos al comercio para que autorice su cuenta de MP.
export function mpOAuthUrl({ state, redirectUri }) {
  const p = new URLSearchParams({ client_id: process.env.MP_CLIENT_ID, response_type: 'code', platform_id: 'mp', state, redirect_uri: redirectUri });
  return `${MP_AUTH}/authorization?${p.toString()}`;
}

async function mpOAuthToken(body) {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: process.env.MP_CLIENT_ID, client_secret: process.env.MP_CLIENT_SECRET, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || data?.error || 'Error de OAuth de Mercado Pago.');
  return data; // { access_token, refresh_token, user_id, expires_in, ... }
}

// Intercambia el `code` de la vuelta de OAuth por los tokens del comercio.
export function mpExchangeCode({ code, redirectUri }) {
  return mpOAuthToken({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

// Renueva el access_token del comercio cuando venció, con su refresh_token.
export function mpRefresh(refreshToken) {
  return mpOAuthToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

// Modo test: lo activa SOLO el token de prueba (MP_TEST_ACCESS_TOKEN, lo seteamos solo en staging).
// Usa credenciales de TEST (tarjetas con titular APRO), cobra el monto REAL en el sandbox y NO mueve
// plata real. IMPORTANTE: en PRODUCCIÓN, MP_TEST_ACCESS_TOKEN NO debe estar seteado (si no, cobraría en sandbox).
export function mpIsTest() {
  return !!process.env.MP_TEST_ACCESS_TOKEN;
}
function mpToken() {
  const token = mpIsTest() ? process.env.MP_TEST_ACCESS_TOKEN : process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('Falta el Access Token de Mercado Pago.');
  return token;
}

// Split: si se pasa `sellerToken` (token OAuth del comercio), el cobro entra a SU cuenta y
// `marketplaceFee` (comisión + flete + recargo) se le retiene a la plataforma. Sin sellerToken,
// el cobro es centralizado (cuenta de Jorge) — el comportamiento de siempre.
export async function createPaymentLink({ orderRef, title, amount, payerEmail, backUrl, notificationUrl, sellerToken, marketplaceFee }) {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sellerToken || mpToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title, quantity: 1, unit_price: Number(amount), currency_id: 'ARS' }],
      ...(sellerToken && marketplaceFee > 0 ? { marketplace_fee: Number(marketplaceFee) } : {}),
      external_reference: orderRef, // para mapear el pago a la orden en el webhook
      // SOLO pagos instantáneos: excluimos efectivo/cupón (ticket = Rapipago/Pago Fácil) y
      // depósito en cajero (atm). Esos se acreditan en días y dejarían el pedido "pendiente" sin
      // poder despachar el envío. Con la ventana de 24hs y la urgencia, no aplican.
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
      payer: payerEmail ? { email: payerEmail } : undefined,
      back_urls: backUrl ? { success: backUrl, pending: backUrl, failure: backUrl } : undefined,
      // auto_return solo con https (MP lo rechaza en localhost)
      auto_return: backUrl && backUrl.startsWith('https://') ? 'approved' : undefined,
      notification_url: notificationUrl || process.env.MP_WEBHOOK_URL || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'No se pudo crear el link de pago.');
  // en modo test usamos el checkout sandbox (tarjetas de prueba)
  const link = mpIsTest() ? data.sandbox_init_point || data.init_point : data.init_point;
  return { preferenceId: data.id, link, sandboxLink: data.sandbox_init_point };
}

// `token` opcional: con split, el pago vive en la cuenta del COMERCIO y solo su token OAuth puede
// consultarlo (el de la plataforma da 404). Sin token, usa el de la plataforma (cobro centralizado).
export async function getPayment(paymentId, token) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token || mpToken()}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar el pago.');
  return res.json();
}

// Id de la preferencia a partir del link ya guardado. El init_point de MP siempre es
// .../checkout/v1/redirect?pref_id=<id>, así que lo derivamos del link en vez de guardar una
// columna nueva: de paso, también podemos desactivar los links generados ANTES de esta función.
export function preferenceIdFromLink(link) {
  if (!link) return null;
  try {
    return new URL(String(link)).searchParams.get('pref_id') || null;
  } catch {
    return null;
  }
}

// Mata un link de pago. MP no permite borrar una preferencia, pero sí ponerle una ventana de
// vigencia ya vencida: el checkout pasa a mostrar "preferencia expirada" y no se puede pagar.
// sellerToken: si la preferencia se creó con el token de otra cuenta (split), solo ESE token
// puede modificarla; sin él, MP responde 404.
// Best-effort: devuelve false en vez de lanzar — el llamador cancela igual en la base, y
// lib/order-guards.js cubre el caso de que el link haya quedado vivo.
const EXPIRED_FROM = '2020-01-01T00:00:00.000-03:00';
const EXPIRED_TO = '2020-01-02T00:00:00.000-03:00';

export async function deactivatePaymentLink(link, sellerToken) {
  const id = preferenceIdFromLink(link);
  if (!id) return false;
  try {
    const res = await fetch(`${MP_API}/checkout/preferences/${id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${sellerToken || mpToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires: true, expiration_date_from: EXPIRED_FROM, expiration_date_to: EXPIRED_TO }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
