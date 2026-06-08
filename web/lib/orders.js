// Lógica de órdenes/envío (server-only). NO es server action.
import { prisma } from '@/lib/db';
import { shippingCostFromTariff, haversineKm, MIN_SHIP } from '@/lib/shipping';

const num = (d) => (d == null ? 0 : Number(d));

// Costo de envío de una orden: distancia (comercio → taller) según coords guardadas + tabla de bandas.
// Si faltan coordenadas o tabla, usa el mínimo ($5000).
export async function computeShip(requestId, storeId) {
  try {
    const [reqRow, store, tariffs] = await Promise.all([
      prisma.request.findUnique({ where: { id: requestId }, select: { mechanicId: true } }),
      prisma.storeProfile.findUnique({ where: { userId: storeId }, select: { lat: true, lng: true } }),
      prisma.shippingTariff.findMany({ orderBy: { uptoKm: 'asc' } }),
    ]);
    const mech = reqRow ? await prisma.mechanicProfile.findUnique({ where: { userId: reqRow.mechanicId }, select: { lat: true, lng: true } }) : null;
    let km = null;
    if (mech?.lat && mech?.lng && store?.lat && store?.lng) {
      km = haversineKm({ lat: Number(store.lat), lng: Number(store.lng) }, { lat: Number(mech.lat), lng: Number(mech.lng) }) * 1.3;
    }
    return shippingCostFromTariff(km, tariffs.map((t) => ({ uptoKm: t.uptoKm, price: Number(t.price) })));
  } catch {
    return MIN_SHIP;
  }
}

// ref = "requestId::quoteId". Crea la orden y marca el pedido como pagado (idempotente).
export async function confirmPaidByRef(ref) {
  if (!ref || !String(ref).includes('::')) return false;
  const [requestId, quoteId] = String(ref).split('::');
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.requestId !== requestId) return false;

  const part = num(q.price);
  const commission = Math.round(part * 0.05);
  const ship = await computeShip(requestId, q.storeId);
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
