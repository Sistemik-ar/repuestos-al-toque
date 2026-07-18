'use server';
// Acciones de admin sobre pedidos SIN pagar. Archivo aparte de data.js a propósito: es una
// operación sensible (toca plata) y así queda todo el flujo — validación, baja del link de MP
// y aviso — en un solo lugar leíble.
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { deactivatePaymentLink } from '@/lib/mercadopago';
import { sendPush } from '@/lib/push';

// Estados que ya no admiten cancelación: la plata entró y hay una pieza en movimiento.
const YA_PAGADO = ['PAID', 'SHIPPED', 'DELIVERED'];
// Estados vivos de un pedido sin pagar.
const VIVOS = ['OPEN', 'QUOTED', 'CLOSED', 'EXPIRED'];

// Cancela un pedido impago. Si el pedido pertenece a un trabajo, se cancela el TRABAJO COMPLETO:
// el link de Mercado Pago cubre todos sus ítems, así que dar de baja uno solo dejaría un link vivo
// cobrando por algo que ya no existe.
export async function adminCancelUnpaidRequest(requestId) {
  const s = await getSession();
  if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };

  const r = await prisma.request.findUnique({
    where: { id: requestId },
    select: { id: true, code: true, status: true, mechanicId: true, jobId: true, job: { select: { id: true, code: true, status: true, paymentLink: true } } },
  });
  if (!r) return { error: 'El pedido no existe' };
  if (YA_PAGADO.includes(r.status)) return { error: 'Este pedido ya fue pagado: no se puede cancelar' };
  if (r.status === 'CANCELLED') return { error: 'Este pedido ya estaba cancelado' };

  const job = r.job;
  if (job && job.status === 'PAID') return { error: 'El trabajo ya fue pagado: no se puede cancelar' };

  // 1) Matar el link de MP ANTES de tocar la base: si el link quedara vivo y el pedido cancelado,
  // un pago entrante no generaría ninguna orden. Es best-effort — si falla, seguimos igual y
  // lib/order-guards.js frena la confirmación del pago.
  let linkDisabled = null;
  if (job?.paymentLink) linkDisabled = await deactivatePaymentLink(job.paymentLink);

  // 2) Cancelar en la base
  let items = 1;
  if (job) {
    const res = await prisma.request.updateMany({ where: { jobId: job.id, status: { in: VIVOS } }, data: { status: 'CANCELLED' } });
    items = res?.count ?? 1;
    await prisma.job.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
  } else {
    await prisma.request.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
  }

  // 3) Avisar al mecánico: el link que tiene abierto dejó de servir
  const ref = job?.code ? `#${job.code}` : `#${r.code}`;
  await sendPush(r.mechanicId, {
    title: 'Tu pedido fue cancelado',
    body: `${ref} — el pedido se dio de baja y el link de pago ya no es válido. Consultá con soporte.`,
    url: '/mecanico',
    tag: 'cancelado-' + (job?.id || r.id),
  }).catch(() => {});

  return { ok: true, items, ref, hadLink: !!job?.paymentLink, linkDisabled };
}
