// Webhook de Mercado Pago. MP avisa cuando hay un pago; consultamos el pago real
// y, si está aprobado, marcamos la orden como pagada (cuando el flujo esté en la DB).
// Con split, el pago vive en la cuenta del COMERCIO: el hint `?store=` (que pusimos en la
// notification_url al crear la preferencia) dice con qué token consultarlo.
import { confirmPaidByRef, getPaymentForStore } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const paymentId = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
    const type = body?.type || url.searchParams.get('type');

    if (type === 'payment' && paymentId) {
      const pay = await getPaymentForStore(paymentId, url.searchParams.get('store'));
      if (pay?.status === 'approved' && pay?.external_reference) {
        await confirmPaidByRef(pay.external_reference, pay.transaction_amount);
      }
    }
    return Response.json({ received: true });
  } catch (e) {
    // Error interno real (ej: DB caída): devolver 500 para que MP REINTENTE.
    // Sin esto, un pago cobrado podía quedar sin confirmar si el comprador no volvía por el navegador.
    return new Response(JSON.stringify({ error: 'retry' }), { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true }); // verificación de MP
}
