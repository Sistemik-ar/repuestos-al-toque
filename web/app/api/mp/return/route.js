// Retorno del navegador desde Mercado Pago. Verifica el pago y confirma la orden.
// (Sirve en local y en prod; el webhook server-to-server es el respaldo en prod.)
import { getPayment, mpIsTest } from '@/lib/mercadopago';
import { confirmPaidByRef } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get('payment_id') || url.searchParams.get('collection_id');
  const status = url.searchParams.get('status') || url.searchParams.get('collection_status');
  const ref = url.searchParams.get('external_reference');
  let confirmed = false;
  try {
    // SOLO se confirma verificando el pago REAL contra Mercado Pago (el external_reference
    // viene de MP, no del navegador). Los parámetros sueltos de la URL no alcanzan.
    if (paymentId) {
      const pay = await getPayment(paymentId);
      if (pay?.status === 'approved' && pay?.external_reference) {
        confirmed = await confirmPaidByRef(pay.external_reference, pay.transaction_amount);
      }
    } else if (mpIsTest() && status === 'approved' && ref) {
      // Atajo de PRUEBAS (sandbox local: requiere MP_TEST_AMOUNT + MP_TEST_ACCESS_TOKEN).
      // En producción esta rama NO existe — no se puede forjar un pago desde la URL.
      confirmed = await confirmPaidByRef(ref);
    }
  } catch (e) {}
  return Response.redirect(new URL(confirmed ? '/mecanico?pago=ok' : '/mecanico?pago=pend', req.url));
}
