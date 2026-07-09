// Lógica de órdenes/envío (server-only). NO es server action.
import { prisma } from '@/lib/db';
import { shippingCostFromTariff, haversineKm, MIN_SHIP } from '@/lib/shipping';
import { drivingKm } from '@/lib/geo';
import { mechanicZone } from '@/lib/zones';
import { getSettings } from '@/lib/settings';
import { mpIsTest } from '@/lib/mercadopago';
import { notifyDeliveryNewTrip } from '@/lib/push';

// ¿El pago real (transaction_amount de MP) cubre lo esperado?
// Tolerancia del 10%: el envío (OSRM) y el redondeo del recargo MP pueden variar unos pesos
// entre la generación del link y la confirmación. Solo bloquea un sub-pago grosero (ej: pagar $10
// por algo de $50.000). En modo prueba (MP_TEST_AMOUNT) no se compara.
export function paidCoversExpected(paidAmount, expectedTotal) {
  if (mpIsTest() || process.env.MP_TEST_AMOUNT) return true;
  if (paidAmount == null || !Number.isFinite(Number(paidAmount))) return true; // sin dato (legacy) -> no bloquear
  return Number(paidAmount) >= expectedTotal * 0.9;
}

const num = (d) => (d == null ? 0 : Number(d));

// ¿La entrega de este mecánico se coordina internamente? (su zona no tiene delivery habilitado).
// En ese caso no se cobra flete por la plataforma y el pedido no aparece a los repartidores.
export async function isInternalFreight(mechanicId) {
  const zone = await mechanicZone(mechanicId);
  return !!zone && !zone.deliveryEnabled;
}

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

// Plan de cobro de un Trabajo: QUÉ ítems se cobran y CUÁNTO cada uno. Es la única fuente
// de verdad del desglose: la usan tanto la generación del link (createJobCheckout) como la
// confirmación del pago (confirmJobPaid). Si ambos calcularan por su cuenta, podrían divergir
// y se cobraría una cosa y se registraría otra.
// El envío se cobra UNA vez por comercio (en el primer ítem de cada comercio).
export async function jobChargePlan(jobId) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { requests: { include: { quotes: true } } } });
  if (!job) return null;
  const settings = await getSettings();
  // zona sin delivery (ej. El Bolsón): la entrega se coordina internamente -> no se cobra flete
  const internalFreight = await isInternalFreight(job.mechanicId);
  // 1) ítems a cobrar (repuesto + comisión), y el flete de la pata de CADA comercio (comercio->taller)
  const base = [];
  const storeShip = new Map(); // storeId -> flete de su pata
  for (const r of job.requests) {
    const sel = r.quotes.find((q) => q.status === 'SELECTED');
    if (!sel || ['PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(r.status)) continue;
    const part = num(sel.price);
    const commission = Math.round(part * (Number(settings.commissionPct) / 100));
    if (!storeShip.has(sel.storeId)) storeShip.set(sel.storeId, internalFreight ? 0 : await computeShip(r.id, sel.storeId));
    base.push({ requestId: r.id, quoteId: sel.id, storeId: sel.storeId, useCredit: !!r.useCredit, part, commission });
  }
  // 2) FLETE ÚNICO por patente = la pata MÁS LARGA (comercio más lejano -> taller). El cliente del
  // mecánico paga un solo flete aunque el auto junte repuestos de varios comercios (un solo viaje).
  const tripShip = storeShip.size ? Math.max(...storeShip.values()) : 0;
  const items = [];
  const totals = { parts: 0, creditParts: 0, commission: 0, ship: 0, mpFee: 0, total: 0 };
  base.forEach((b, i) => {
    const ship = i === 0 ? tripShip : 0; // el flete único se imputa al primer ítem
    // ítem a cuenta corriente: el repuesto lo liquida el comercio; la plataforma cobra comisión + flete
    const cobrable = (b.useCredit ? 0 : b.part) + b.commission + ship;
    const mpFee = settings.mpFeeEnabled ? Math.round(cobrable * (Number(settings.mpFeePct) / 100)) : 0;
    items.push({ ...b, ship, mpFee, cobrado: cobrable + mpFee });
    if (b.useCredit) totals.creditParts += b.part; else totals.parts += b.part;
    totals.commission += b.commission; totals.ship += ship; totals.mpFee += mpFee; totals.total += cobrable + mpFee;
  });
  return { job, settings, items, totals, stores: storeShip.size, internalFreight };
}

// Confirma el pago de un Trabajo completo (ref "job::<id>"): crea una orden por ítem elegido.
async function confirmJobPaid(jobId, paidAmount) {
  const plan = await jobChargePlan(jobId);
  if (!plan) return false;
  // verificación de monto: si el pago real no cubre lo esperado, NO confirmar (posible manipulación)
  if (!paidCoversExpected(paidAmount, plan.totals.total)) return false;
  for (const it of plan.items) {
    try {
      await prisma.order.upsert({
        where: { requestId: it.requestId },
        update: { status: 'PAID' },
        create: { requestId: it.requestId, quoteId: it.quoteId, mechanicId: plan.job.mechanicId, storeId: it.storeId, partAmount: it.part, commissionPct: Number(plan.settings.commissionPct), commissionAmount: it.commission, freightAmount: plan.internalFreight ? null : it.ship, mpFeeAmount: it.mpFee, internalFreight: plan.internalFreight, creditAccount: it.useCredit, total: it.cobrado, status: 'PAID' },
      });
    } catch (e) { if (e?.code !== 'P2002') throw e; }
    await prisma.request.update({ where: { id: it.requestId }, data: { status: 'PAID' } }).catch(() => {});
  }
  // los ítems sin cotización elegida quedan "sin compra" (el vendedor deja de esperar decisión)
  await prisma.request.updateMany({
    where: { jobId, status: { in: ['OPEN', 'QUOTED', 'CLOSED'] }, quotes: { none: { status: 'SELECTED' } } },
    data: { status: 'CANCELLED' },
  }).catch(() => {});
  await prisma.job.update({ where: { id: jobId }, data: { status: 'PAID' } }).catch(() => {});
  // hay pieza física para fletar — salvo coordinación interna: ese viaje no es de la flota
  if (!plan.internalFreight && plan.items.some((it) => !it.useCredit)) await notifyDeliveryNewTrip();
  return true;
}

// ref = "requestId::quoteId" (o "::cc" para cuenta corriente, o "job::<id>" para un trabajo).
// Crea la orden y marca el pedido como pagado (idempotente).
export async function confirmPaidByRef(ref, paidAmount) {
  if (!ref || !String(ref).includes('::')) return false;
  if (String(ref).startsWith('job::')) return confirmJobPaid(String(ref).slice(5), paidAmount);
  const [requestId, quoteId, mode] = String(ref).split('::');
  const creditAccount = mode === 'cc';
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.requestId !== requestId) return false;

  const part = num(q.price);
  const internalFreight = await isInternalFreight(q.request.mechanicId);
  const ship = internalFreight ? 0 : await computeShip(requestId, q.storeId);
  const settings = await getSettings();
  const p = computePricing(part, ship, settings, creditAccount);
  // verificación de monto (defensa en profundidad): el pago real debe cubrir el total
  if (!paidCoversExpected(paidAmount, p.total)) return false;

  try {
    await prisma.order.upsert({
      where: { requestId },
      update: { status: 'PAID' },
      create: { requestId, quoteId, mechanicId: q.request.mechanicId, storeId: q.storeId, partAmount: p.part, commissionPct: p.commissionPct, commissionAmount: p.commission, freightAmount: internalFreight ? null : p.ship, mpFeeAmount: p.mpFeeAmount, internalFreight, creditAccount: p.creditAccount, total: p.total, status: 'PAID' },
    });
  } catch (e) {
    // el webhook y la vuelta del navegador pueden confirmar a la vez -> la orden ya existe
    if (e?.code !== 'P2002') throw e;
  }
  await prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } }).catch(() => {});
  await prisma.request.update({ where: { id: requestId }, data: { status: 'PAID' } });
  if (!creditAccount && !internalFreight) await notifyDeliveryNewTrip(); // pieza pagada por plataforma -> necesita flete
  return true;
}
