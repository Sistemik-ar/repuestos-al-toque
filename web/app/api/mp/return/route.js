// Retorno del navegador desde Mercado Pago. Verifica el pago y confirma la orden.
// (Sirve en local y en prod; el webhook server-to-server es el respaldo en prod.)
import { getPayment } from '@/lib/mercadopago';
import { confirmPaidByRef } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get('payment_id') || url.searchParams.get('collection_id');
  const status = url.searchParams.get('status') || url.searchParams.get('collection_status');
  const ref = url.searchParams.get('external_reference');
  try {
    if (paymentId) {
      const pay = await getPayment(paymentId);
      if (pay?.status === 'approved') await confirmPaidByRef(pay.external_reference || ref);
    } else if (status === 'approved' && ref) {
      await confirmPaidByRef(ref);
    }
  } catch (e) {}
  const ok = status === 'approved' || !!paymentId;
  return Response.redirect(new URL(ok ? '/mecanico?pago=ok' : '/mecanico?pago=pend', req.url));
}
