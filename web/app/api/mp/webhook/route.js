// Webhook de Mercado Pago. MP avisa cuando hay un pago; consultamos el pago real
// y, si está aprobado, marcamos la orden como pagada (cuando el flujo esté en la DB).
import { getPayment } from '@/lib/mercadopago';
// import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = new URL(req.url);
    const paymentId = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
    const type = body?.type || url.searchParams.get('type');

    if (type === 'payment' && paymentId) {
      const pay = await getPayment(paymentId);
      if (pay?.status === 'approved' && pay?.external_reference) {
        // TODO (cuando el flujo de órdenes esté en la DB):
        // await prisma.order.update({ where: { id: pay.external_reference }, data: { status: 'PAID' } });
        // await prisma.payment.create({ data: { orderId: pay.external_reference, mpPaymentId: String(pay.id), status: 'approved', amount: pay.transaction_amount, raw: pay } });
        console.log('MP pago aprobado para orden', pay.external_reference);
      }
    }
    return Response.json({ received: true });
  } catch (e) {
    // Siempre 200 para que MP no reintente en loop por un error nuestro.
    return Response.json({ received: true });
  }
}

export async function GET() {
  return Response.json({ ok: true }); // verificación de MP
}
