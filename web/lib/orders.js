// Confirmación de pago (server-only). NO es server action: solo lo llaman las
// rutas /api/mp/return y /api/mp/webhook, después de verificar el pago con MP.
import { prisma } from '@/lib/db';

const num = (d) => (d == null ? 0 : Number(d));

// ref = "requestId::quoteId". Crea la orden y marca el pedido como pagado (idempotente).
export async function confirmPaidByRef(ref) {
  if (!ref || !String(ref).includes('::')) return false;
  const [requestId, quoteId] = String(ref).split('::');
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.requestId !== requestId) return false;

  const part = num(q.price);
  const commission = Math.round(part * 0.05);
  const ship = 3500;
  const total = part + commission + ship;

  await prisma.order.upsert({
    where: { requestId },
    update: { status: 'PAID' },
    create: { requestId, quoteId, mechanicId: q.request.mechanicId, storeId: q.storeId, partAmount: part, commissionAmount: commission, freightAmount: ship, total, status: 'PAID' },
  });
  await prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } }).catch(() => {});
  await prisma.request.update({ where: { id: requestId }, data: { status: 'PAID' } });
  return true;
}
