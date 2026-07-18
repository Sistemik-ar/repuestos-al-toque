// Red de seguridad del cobro (server-only). NO es server action.
//
// El problema: el link de pago de Mercado Pago vive aparte de nuestra base. Cuando el admin
// cancela un trabajo impago intentamos desactivar la preferencia en MP, pero eso es best-effort
// (puede fallar la API, o el mecánico puede estar pagando en ese mismo instante).
//
// Si un pago así llegara a la confirmación, el daño sería silencioso: jobChargePlan saltea los
// ítems CANCELLED, el total daría 0, paidCoversExpected(pagado, 0) devolvería true y el trabajo
// quedaría marcado como PAGADO sin ninguna orden creada. Plata cobrada, pieza que nadie despacha,
// y nadie se entera. Por eso cortamos ANTES de confirmar y avisamos al admin para que reembolse.
import { prisma } from '@/lib/db';

// ¿El trabajo sigue siendo cobrable? Solo bloqueamos el caso explícito (CANCELLED).
// Si no podemos leer la base, NO bloqueamos: preferimos confirmar un pago legítimo antes que
// rechazarlo por un error transitorio (el resto de la confirmación va a fallar igual y reintentar).
export async function jobIsChargeable(jobId) {
  try {
    const j = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
    return !j || j.status !== 'CANCELLED';
  } catch {
    return true;
  }
}

// Mismo criterio para el flujo de ítem suelto (ref "requestId::quoteId", sin trabajo).
export async function requestIsChargeable(requestId) {
  try {
    const r = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true } });
    return !r || r.status !== 'CANCELLED';
  } catch {
    return true;
  }
}

// Deja registro del pago huérfano y avisa por Telegram (si está configurado). Nunca lanza.
export async function reportOrphanPayment({ ref, paidAmount }) {
  // el log queda en Vercel aunque Telegram no esté activado
  console.error('[pago-huerfano] llegó un pago de un pedido cancelado', { ref, paidAmount });
  try {
    const jobId = String(ref || '').startsWith('job::') ? String(ref).slice(5) : null;
    const job = jobId ? await prisma.job.findUnique({ where: { id: jobId }, select: { code: true } }) : null;
    const { tgNotifyOrphanPayment } = await import('@/lib/telegram');
    await tgNotifyOrphanPayment({ ref, code: job?.code, paidAmount });
  } catch {}
}
