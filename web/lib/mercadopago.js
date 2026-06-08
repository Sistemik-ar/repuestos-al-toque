// Mercado Pago — cobro CENTRALIZADO (cuenta de Jorge), SIN split.
// Crea una preferencia de Checkout Pro y devuelve el LINK DE PAGO (init_point).
// Necesita MP_ACCESS_TOKEN (Access Token de la cuenta de Jorge) en las variables de entorno.
// La plata entra a la cuenta de Jorge; él le paga a vendedores y repartidores aparte.

const MP_API = 'https://api.mercadopago.com';

export async function createPaymentLink({ orderRef, title, amount, payerEmail, backUrl, notificationUrl }) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN (Access Token de Mercado Pago).');

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title, quantity: 1, unit_price: Number(amount), currency_id: 'ARS' }],
      external_reference: orderRef, // para mapear el pago a la orden en el webhook
      payer: payerEmail ? { email: payerEmail } : undefined,
      back_urls: backUrl ? { success: backUrl, pending: backUrl, failure: backUrl } : undefined,
      // auto_return solo con https (MP lo rechaza en localhost)
      auto_return: backUrl && backUrl.startsWith('https://') ? 'approved' : undefined,
      notification_url: notificationUrl || process.env.MP_WEBHOOK_URL || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'No se pudo crear el link de pago.');
  return { preferenceId: data.id, link: data.init_point, sandboxLink: data.sandbox_init_point };
}

export async function getPayment(paymentId) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN.');
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('No se pudo consultar el pago.');
  return res.json();
}
