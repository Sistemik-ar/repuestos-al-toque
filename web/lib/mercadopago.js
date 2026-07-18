// Mercado Pago — cobro CENTRALIZADO (cuenta de Jorge), SIN split.
// Crea una preferencia de Checkout Pro y devuelve el LINK DE PAGO (init_point).
// Necesita MP_ACCESS_TOKEN (Access Token de la cuenta de Jorge) en las variables de entorno.
// La plata entra a la cuenta de Jorge; él le paga a vendedores y repartidores aparte.

const MP_API = 'https://api.mercadopago.com';

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

export async function createPaymentLink({ orderRef, title, amount, payerEmail, backUrl, notificationUrl }) {
  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${mpToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title, quantity: 1, unit_price: Number(amount), currency_id: 'ARS' }],
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

export async function getPayment(paymentId) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken()}` },
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
