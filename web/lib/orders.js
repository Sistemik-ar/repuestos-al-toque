// Lógica de órdenes/envío (server-only). NO es server action.
import { prisma } from '@/lib/db';
import { shippingCostFromTariff, haversineKm, MIN_SHIP } from '@/lib/shipping';
import { drivingKm } from '@/lib/geo';
import { getSettings } from '@/lib/settings';

const num = (d) => (d == null ? 0 : Number(d));

// Desglose de precios según la config (comisión % + recargo MP).
// creditAccount: cuenta corriente -> el repuesto NO se cobra por la plataforma (se imputa a la CC),
// la plataforma solo cobra comisión + envío.
export function computePricing(part, ship, settings, creditAccount = false) {
  const commissionPct = Number(settings.commissionPct);
  const commission = Math.round(part * (commissionPct / 100));
  const cobrable = (creditAccount ? 0 : part) + commission + ship;
  const mpFeeAmount = settings.mpFeeEnabled ? Math.round(cobrable * (Number(settings.mpFeePct) / 100)) : 0;
  return { part, commission, commissionPct, ship, mpFeeAmount, creditAccount, total: cobrable + mpFeeAmount };
}

// Costo de envío de una orden: distancia (comercio → taller) según coords guardadas + tabla de bandas.
// Si faltan coordenadas o tabla, usa el mínimo ($5000).
export async function computeShip(requestId, storeId) {
  try {
    const [reqRow, store, tariffs, settings] = await Promise.all([
      prisma.request.findUnique({ where: { id: requestId }, select: { mechanicId: true } }),
      prisma.storeProfile.findUnique({ where: { userId: storeId }, select: { lat: true, lng: true } }),
      prisma.shippingTariff.findMany({ orderBy: { uptoKm: 'asc' } }),
      getSettings(),
    ]);
    const mech = reqRow ? await prisma.mechanicProfile.findUnique({ where: { userId: reqRow.mechanicId }, select: { lat: true, lng: true } }) : null;
    let km = null;
    if (mech?.lat && mech?.lng && store?.lat && store?.lng) {
      const a = { lat: Number(store.lat), lng: Number(store.lng) };
      const b = { lat: Number(mech.lat), lng: Number(mech.lng) };
      // distancia de manejo real (OSRM); si el servicio falla, estima con línea recta +30%
      km = (await drivingKm(a, b)) ?? haversineKm(a, b) * 1.3;
    }
    return shippingCostFromTariff(km, tariffs.map((t) => ({ uptoKm: t.uptoKm, price: Number(t.price) })), settings.minShip);
  } catch {
    return MIN_SHIP;
  }
}

// ref = "requestId::quoteId" (o "requestId::quoteId::cc" para cuenta corriente).
// Crea la orden y marca el pedido como pagado (idempotente).
export async function confirmPaidByRef(ref) {
  if (!ref || !String(ref).includes('::')) return false;
  const [requestId, quoteId, mode] = String(ref).split('::');
  const creditAccount = mode === 'cc';
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.requestId !== requestId) return false;

  const part = num(q.price);
  const ship = await computeShip(requestId, q.storeId);
  const settings = await getSettings();
  const p = computePricing(part, ship, settings, creditAccount);

  try {
    await prisma.order.upsert({
      where: { requestId },
      update: { status: 'PAID' },
      create: { requestId, quoteId, mechanicId: q.request.mechanicId, storeId: q.storeId, partAmount: p.part, commissionPct: p.commissionPct, commissionAmount: p.commission, freightAmount: p.ship, mpFeeAmount: p.mpFeeAmount, creditAccount: p.creditAccount, total: p.total, status: 'PAID' },
    });
  } catch (e) {
    // el webhook y la vuelta del navegador pueden confirmar a la vez -> la orden ya existe
    if (e?.code !== 'P2002') throw e;
  }
  await prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } }).catch(() => {});
  await prisma.request.update({ where: { id: requestId }, data: { status: 'PAID' } });
  return true;
}
