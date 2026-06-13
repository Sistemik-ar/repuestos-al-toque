// Mercado Pago — cobro CENTRALIZADO (cuenta de Jorge), SIN split.
// Crea una preferencia de Checkout Pro y devuelve el LINK DE PAGO (init_point).
// Necesita MP_ACCESS_TOKEN (Access Token de la cuenta de Jorge) en las variables de entorno.
// La plata entra a la cuenta de Jorge; él le paga a vendedores y repartidores aparte.

const MP_API = 'https://api.mercadopago.com';

// Modo test: activo cuando hay monto de prueba + token de prueba. Usa credenciales de TEST
// (tarjetas de prueba con titular APRO) y NO mueve plata real.
export function mpIsTest() {
  return !!process.env.MP_TEST_AMOUNT && !!process.env.MP_TEST_ACCESS_TOKEN;
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
