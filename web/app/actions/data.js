'use server';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { createPaymentLink } from '@/lib/mercadopago';
import { computeShip, computePricing } from '@/lib/orders';
import { getSettings as readSettings } from '@/lib/settings';
import { geocode, inBariloche } from '@/lib/geo';
import { creditStatus, creditActive } from '@/lib/credit';

const URGENCY = { 'Necesito ahora': 'AHORA', Hoy: 'HOY', 'Mañana': 'MANANA' };
const URGENCY_LABEL = { AHORA: 'Necesito ahora', HOY: 'Hoy', MANANA: 'Mañana' };

const ALIASES = { 'Repuestos Centro': 'Proveedor #12', 'Andina Parts': 'Distribuidor Centro', 'Patagonia Frenos': 'Zona Oeste Parts' };
function aliasFor(name) {
  if (ALIASES[name]) return ALIASES[name];
  let h = 0; for (const c of String(name || 'Vendedor')) h = (h * 31 + c.charCodeAt(0)) % 97;
  return 'Proveedor #' + (10 + (h % 80));
}

const num = (d) => (d == null ? null : Number(d));

function reqBase(r) {
  return {
    id: r.id, code: r.code, brand: r.brand, model: r.model, year: r.year, vin: r.vin,
    cat: r.category?.slug || null, catLabel: r.category?.name || null,
    desc: r.description, urgency: URGENCY_LABEL[r.urgency] || 'Necesito ahora',
    status: r.status, photoUrls: r.photoUrls || [],
    invoiceType: r.invoiceType === 'FACTURA_A' ? 'factura_a' : 'consumidor_final',
    emisorRazon: r.invEmisorName, emisorCuit: r.invEmisorCuit, solicRazon: r.invBuyerName, solicCuit: r.invBuyerCuit,
    windowEndsAt: r.windowEndsAt ? r.windowEndsAt.getTime() : null,
    selectedAt: r.selectedAt ? r.selectedAt.getTime() : null,
    createdAt: r.createdAt?.getTime() || 0,
  };
}
// Para el mecánico: sin identidad del vendedor (anónimo)
function quotePublic(q, creditEligible = false) {
  return { id: q.id, alias: q.alias, optionLabel: q.optionLabel, partBrand: q.partBrand, price: num(q.price), warranty: q.warranty, note: q.note, photoUrls: q.photoUrls || [], rating: num(q.ratingSnapshot) || 4.8, zone: 'Centro', status: q.status, creditEligible };
}

export async function getMe() {
  const s = await getSession();
  return s ? { id: s.id, email: s.email, role: s.role, name: s.name } : null;
}

// ---- Mecánico ----
export async function createRequest(input) {
  const s = await getSession();
  if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  if (!String(input.desc || '').trim()) return { error: 'Describí el repuesto que necesitás.' };
  let categoryId = input._categoryId ?? null;
  if (!categoryId && input.cat) { const c = await prisma.category.findUnique({ where: { slug: input.cat } }); categoryId = c?.id ?? null; }
  const data = {
    mechanicId: s.id,
    brand: input.brand || null, model: input.model || null, year: input.year ? parseInt(input.year, 10) : null, vin: input.vin || null,
    categoryId, description: input.desc || null,
    urgency: URGENCY[input.urgency] || 'AHORA',
    photoUrls: input.photoUrls || [],
    invoiceType: input.invoiceType === 'factura_a' ? 'FACTURA_A' : 'CONSUMIDOR_FINAL',
    invEmisorName: input.emisorRazon || null, invEmisorCuit: input.emisorCuit || null,
    invBuyerName: input.solicRazon || null, invBuyerCuit: input.solicCuit || null,
    jobId: input._jobId ?? null,
    status: 'OPEN',
    // los ítems de un trabajo en armado no tienen ventana hasta publicar ("Eso es todo")
    windowEndsAt: input._noWindow ? null : new Date(Date.now() + 10 * 60 * 1000),
  };
  // código legible + reintento por si dos pedidos se crean a la vez (evita colisión del unique)
  for (let attempt = 0; attempt < 6; attempt++) {
    const n = await prisma.request.count();
    const code = String(1042 + n + (attempt ? Math.floor(Math.random() * 5000) : 0));
    try {
      const r = await prisma.request.create({ data: { ...data, code } });
      return { id: r.id, code: r.code };
    } catch (e) {
      if (e?.code !== 'P2002') throw e; // solo reintenta si fue colisión de code
    }
  }
  return { error: 'No se pudo generar el pedido, reintentá.' };
}

export async function getMyRequests() {
  const s = await getSession(); if (!s) return [];
  await expireUnpaid();
  const rows = await prisma.request.findMany({ where: { mechanicId: s.id }, orderBy: { createdAt: 'desc' }, include: { category: true } });
  return rows.map(reqBase);
}

export async function getRequestForMechanic(id) {
  const s = await getSession(); if (!s) return null;
  const r = await prisma.request.findUnique({ where: { id }, include: { category: true, quotes: { orderBy: { ratingSnapshot: 'desc' } } } });
  if (!r || r.mechanicId !== s.id) return null;
  // cuentas corrientes activas del mecánico (para etiquetar ofertas sin revelar identidad)
  const cc = await prisma.creditAccount.findMany({ where: { mechanicId: s.id, active: true }, select: { storeId: true } });
  const ccSet = new Set(cc.map((c) => c.storeId));
  return { ...reqBase(r), quotes: r.quotes.map((q) => quotePublic(q, ccSet.has(q.storeId))) };
}

// Detalle completo de un pedido del mecánico (estado, oferta elegida, totales, envío).
export async function getRequestDetail(id) {
  const s = await getSession(); if (!s) return null;
  const r = await prisma.request.findUnique({ where: { id }, include: { category: true, quotes: true, order: true } });
  if (!r || r.mechanicId !== s.id) return null;
  const sel = r.quotes.find((q) => q.status === 'SELECTED') || null;
  const o = r.order;
  return {
    ...reqBase(r),
    quotesCount: r.quotes.length,
    selected: sel ? quotePublic(sel) : null,
    order: o ? { status: o.status, part: num(o.partAmount), commission: num(o.commissionAmount), commissionPct: num(o.commissionPct), ship: num(o.freightAmount), mpFee: num(o.mpFeeAmount), total: num(o.total), creditAccount: o.creditAccount, hasDelivery: !!o.deliveryId, deliveryPin: ['PAID', 'SHIPPED'].includes(o.status) ? o.deliveryPin : null, arrivedDrop: !!o.arrivedDropAt } : null,
  };
}

export async function acceptQuote(quoteId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.request.mechanicId !== s.id) return { error: 'No autorizado' };
  await prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } });
  await prisma.request.update({ where: { id: q.requestId }, data: { status: 'CLOSED', selectedAt: new Date() } });
  return { ok: true, requestId: q.requestId, quoteId };
}

// Si el mecánico eligió una oferta pero no pagó en 24hs, el pedido pasa a CANCELADO.
// Se evalúa de forma perezosa en cada lectura (sin cron).
const PAY_TTL_MS = 24 * 60 * 60 * 1000;
async function expireUnpaid() {
  try {
    await prisma.request.updateMany({
      where: { status: 'CLOSED', selectedAt: { lt: new Date(Date.now() - PAY_TTL_MS) } },
      data: { status: 'CANCELLED' },
    });
  } catch {}
}

// El mecánico vuelve a publicar un pedido (cancelado, entregado o el que sea) con los mismos datos.
export async function duplicateRequest(id) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const r = await prisma.request.findUnique({ where: { id } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  return createRequest({
    brand: r.brand, model: r.model, year: r.year ? String(r.year) : '', vin: r.vin,
    cat: null, desc: r.description, urgency: URGENCY_LABEL[r.urgency],
    photoUrls: r.photoUrls || [],
    invoiceType: r.invoiceType === 'FACTURA_A' ? 'factura_a' : 'consumidor_final',
    solicRazon: r.invBuyerName, solicCuit: r.invBuyerCuit,
    _categoryId: r.categoryId,
  });
}

export async function closeWindow(requestId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const r = await prisma.request.findUnique({ where: { id: requestId }, select: { mechanicId: true } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  await prisma.request.update({ where: { id: requestId }, data: { windowEndsAt: new Date() } });
  return { ok: true };
}

export async function reopenWindow(requestId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const r = await prisma.request.findUnique({ where: { id: requestId }, select: { mechanicId: true, jobId: true } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  const ends = new Date(Date.now() + 10 * 60 * 1000);
  if (r.jobId) {
    // la ventana es del TRABAJO: reabrir reabre todos los ítems aún sin comprar
    await prisma.job.update({ where: { id: r.jobId }, data: { status: 'OPEN', windowEndsAt: ends } }).catch(() => {});
    await prisma.request.updateMany({ where: { jobId: r.jobId, status: { in: ['OPEN', 'QUOTED', 'CLOSED'] } }, data: { status: 'OPEN', windowEndsAt: ends } });
  } else {
    await prisma.request.update({ where: { id: requestId }, data: { status: 'OPEN', windowEndsAt: ends } });
  }
  return { ok: true };
}

export async function markRequestPaid(requestId, quoteId) {
  const s = await getSession(); if (!s) return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId } });
  if (!q) return { error: 'Cotización no encontrada' };
  const part = num(q.price) || 0;
  const ship = await computeShip(requestId, q.storeId);
  const p = computePricing(part, ship, await readSettings());
  const orderData = { quoteId, storeId: q.storeId, partAmount: p.part, commissionPct: p.commissionPct, commissionAmount: p.commission, freightAmount: p.ship, mpFeeAmount: p.mpFeeAmount, total: p.total, status: 'PAID' };
  await prisma.order.upsert({
    where: { requestId },
    update: orderData,
    create: { requestId, mechanicId: s.id, ...orderData },
  });
  await prisma.request.update({ where: { id: requestId }, data: { status: 'PAID' } });
  return { ok: true };
}

// ---- Mercado Pago: crea el link de pago (cobro centralizado a la cuenta de Jorge) ----
export async function createMpCheckout(requestId, quoteId, opts = {}) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.request.mechanicId !== s.id) return { error: 'No autorizado' };

  const part = num(q.price) || 0;
  const ship = await computeShip(requestId, q.storeId);
  // verificación server-side: solo se honra cuenta corriente si existe una CC ACTIVA real
  const creditAccount = !!opts.creditAccount && (await ccActiveBetween(s.id, q.storeId));
  const p = computePricing(part, ship, await readSettings(), creditAccount);
  // Monto de prueba: si MP_TEST_AMOUNT está seteado, cobra eso (ej: 10) en vez del total real.
  const amount = process.env.MP_TEST_AMOUNT ? Number(process.env.MP_TEST_AMOUNT) : p.total;
  const orderRef = creditAccount ? `${requestId}::${quoteId}::cc` : `${requestId}::${quoteId}`;

  const h = headers();
  const host = h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const appUrl = `${proto}://${host}`;

  try {
    const { link } = await createPaymentLink({
      orderRef,
      title: creditAccount ? `Comisión + envío · pedido #${q.request.code}` : `Repuesto · pedido #${q.request.code}`,
      amount,
      backUrl: `${appUrl}/api/mp/return`,
      notificationUrl: `${appUrl}/api/mp/webhook`,
    });
    return { link };
  } catch (e) {
    return { error: e?.message || 'No se pudo generar el link de pago.' };
  }
}

// Desglose para mostrar en la pantalla de pago (mismo cálculo que el checkout).
export async function getOrderBreakdown(requestId, quoteId, opts = {}) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return null;
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.request.mechanicId !== s.id) return null;
  const part = num(q.price) || 0;
  const ship = await computeShip(requestId, q.storeId);
  const creditAccount = !!opts.creditAccount && (await ccActiveBetween(s.id, q.storeId));
  return computePricing(part, ship, await readSettings(), creditAccount);
}

async function ccActiveBetween(mechanicId, storeId) {
  const cc = await prisma.creditAccount.findFirst({ where: { mechanicId, storeId, active: true }, select: { id: true } });
  return !!cc;
}

// ---- Comercio (vendedor) ----
export async function getOpenRequestsForStore() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return [];
  await expireUnpaid();
  const rows = await prisma.request.findMany({
    where: {
      OR: [
        // publicadas (los borradores de trabajos no tienen ventana y no se ven)
        { status: { in: ['OPEN', 'QUOTED'] }, windowEndsAt: { not: null } },
        // cerradas/canceladas solo si yo coticé (para ver "pendiente de pago" / "cancelado")
        { status: { in: ['CLOSED', 'CANCELLED'] }, quotes: { some: { storeId: s.id } } },
      ],
    },
    orderBy: { createdAt: 'asc' }, // las nuevas aparecen a la derecha
    include: { category: true, quotes: { where: { storeId: s.id }, select: { id: true, price: true, status: true } } },
  });
  // sin identidad del mecánico
  return rows.map((r) => ({
    ...reqBase(r),
    myCount: r.quotes.length,
    myPrices: r.quotes.map((q) => num(q.price)),
    mySelected: r.quotes.some((q) => q.status === 'SELECTED'),
    mySelectedPrice: num(r.quotes.find((q) => q.status === 'SELECTED')?.price) || null,
  }));
}

export async function getStoreSales() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return [];
  const orders = await prisma.order.findMany({ where: { storeId: s.id, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } }, orderBy: { createdAt: 'desc' }, include: { request: { include: { category: true } } } });
  return orders.map((o) => ({ orderId: o.id, orderStatus: o.status, hasDelivery: !!o.deliveryId, creditAccount: o.creditAccount, arrivedPickup: !!o.arrivedPickupAt, issue: o.issue || null, total: num(o.total), part: num(o.partAmount), ...reqBase(o.request) }));
}

export async function createQuote(requestId, input) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true, windowEndsAt: true } });
  if (!req) return { error: 'Solicitud no encontrada' };
  if (!['OPEN', 'QUOTED'].includes(req.status)) return { error: 'La solicitud ya no admite cotizaciones' };
  if (req.windowEndsAt && req.windowEndsAt.getTime() < Date.now()) return { error: 'La ventana de cotización ya cerró' };
  // El repuestero puede enviar varias opciones (ej. Original / Alternativa), hasta un tope.
  const MAX_OPCIONES = 3;
  const mine = await prisma.requestQuote.count({ where: { requestId, storeId: s.id } });
  if (mine >= MAX_OPCIONES) return { error: `Podés enviar hasta ${MAX_OPCIONES} opciones por solicitud` };
  const store = await prisma.storeProfile.findUnique({ where: { userId: s.id } });
  await prisma.requestQuote.create({
    data: {
      requestId, storeId: s.id, alias: aliasFor(s.name || store?.tradeName),
      optionLabel: input.optionLabel || null,
      partBrand: input.partBrand || null, price: Number(String(input.price).replace(/\D/g, '')) || 0,
      warranty: input.warranty || '6 meses', note: input.note || null,
      ratingSnapshot: store?.ratingAvg ?? 4.8, photoUrls: input.photoUrls || [],
    },
  });
  await prisma.request.update({ where: { id: requestId }, data: { status: 'QUOTED' } }).catch(() => {});
  return { ok: true };
}

// ---- Repartidor ----
export async function getMyDeliveries() {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return [];
  // disponibles (sin repartidor asignado) + las mías en curso
  const orders = await prisma.order.findMany({
    where: { OR: [{ status: 'PAID', deliveryId: null }, { deliveryId: s.id, status: { in: ['PAID', 'SHIPPED'] } }] },
    orderBy: { createdAt: 'desc' },
    include: { request: { include: { category: true } } },
  });
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const mechIds = [...new Set(orders.map((o) => o.mechanicId))];
  const [stores, mechs] = await Promise.all([
    prisma.storeProfile.findMany({ where: { userId: { in: storeIds } }, select: { userId: true, tradeName: true, address: true, barrio: true } }),
    prisma.mechanicProfile.findMany({ where: { userId: { in: mechIds } }, select: { userId: true, workshopName: true, address: true, barrio: true } }),
  ]);
  const sMap = Object.fromEntries(stores.map((x) => [x.userId, x]));
  const mMap = Object.fromEntries(mechs.map((x) => [x.userId, x]));
  return orders.map((o) => ({
    orderId: o.id, status: o.status, mine: o.deliveryId === s.id, freight: num(o.freightAmount),
    arrivedPickup: !!o.arrivedPickupAt, arrivedDrop: !!o.arrivedDropAt, issue: o.issue || null,
    // el PIN de retiro solo lo ve el repartidor asignado (se lo muestra al vendedor)
    pickupPin: o.deliveryId === s.id ? o.pickupPin : null,
    ...reqBase(o.request),
    pickup: sMap[o.storeId] ? { name: sMap[o.storeId].tradeName, address: sMap[o.storeId].address, barrio: sMap[o.storeId].barrio } : null,
    dropoff: mMap[o.mechanicId] ? { name: mMap[o.mechanicId].workshopName, address: mMap[o.mechanicId].address, barrio: mMap[o.mechanicId].barrio } : null,
  }));
}

const newPin = () => String(Math.floor(1000 + Math.random() * 9000)); // 4 dígitos

// Tomar pedido — claim ATÓMICO: el updateMany con deliveryId:null garantiza que
// solo UN repartidor puede quedárselo aunque varios toquen el botón a la vez.
// Genera los 2 PINs: retiro (verifica el vendedor) y entrega (verifica el mecánico).
export async function claimDelivery(orderId) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const prof = await prisma.deliveryProfile.findUnique({ where: { userId: s.id }, select: { docsOk: true } });
  if (!prof?.docsOk) return { error: 'Tu cuenta no está habilitada todavía (falta validar tu documentación)' };
  const r = await prisma.order.updateMany({
    where: { id: orderId, deliveryId: null, status: 'PAID' },
    data: { deliveryId: s.id, pickupPin: newPin(), deliveryPin: newPin() },
  });
  if (r.count === 0) return { error: 'Otro repartidor ya tomó este pedido' };
  return { ok: true };
}

// El VENDEDOR confirma que le entregó la pieza al repartidor, verificando el PIN de retiro
// que le muestra el repartidor (garantiza que es el que tomó el pedido).
export async function storeConfirmPickup(orderId, pin) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true, status: true, deliveryId: true, pickupPin: true, requestId: true } });
  if (!o || o.storeId !== s.id) return { error: 'No autorizado' };
  if (!o.deliveryId) return { error: 'Ningún repartidor tomó este pedido todavía' };
  if (o.status !== 'PAID') return { error: 'Este pedido ya fue retirado' };
  if (String(pin).trim() !== o.pickupPin) return { error: 'PIN incorrecto. Pedile el PIN al repartidor.' };
  await prisma.order.update({ where: { id: orderId }, data: { status: 'SHIPPED', pickedAt: new Date() } });
  await prisma.request.update({ where: { id: o.requestId }, data: { status: 'SHIPPED' } }).catch(() => {});
  return { ok: true };
}

// El REPARTIDOR confirma la entrega ingresando el PIN que le da el mecánico en mano.
export async function markDelivered(orderId, pin) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryId: true, status: true, deliveryPin: true, requestId: true } });
  if (!o || o.deliveryId !== s.id) return { error: 'Este pedido no está asignado a vos' };
  if (o.status !== 'SHIPPED') return { error: 'Primero el vendedor tiene que confirmar el retiro' };
  if (String(pin).trim() !== o.deliveryPin) return { error: 'PIN incorrecto. Pedíselo al mecánico.' };
  await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
  await prisma.request.update({ where: { id: o.requestId }, data: { status: 'DELIVERED' } }).catch(() => {});
  return { ok: true };
}

// ---- Calificaciones (mecánico → vendedor / producto / delivery, al cerrar el ciclo) ----
export async function rateOrder(requestId, ratings) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { requestId }, select: { id: true, mechanicId: true, storeId: true, deliveryId: true, status: true } });
  if (!o || o.mechanicId !== s.id) return { error: 'No autorizado' };
  if (o.status !== 'DELIVERED') return { error: 'Podés calificar cuando recibas el pedido' };
  const items = [
    { kind: 'SELLER', toId: o.storeId, stars: ratings?.seller },
    { kind: 'PRODUCT', toId: o.storeId, stars: ratings?.product },
    { kind: 'DELIVERY', toId: o.deliveryId, stars: ratings?.delivery },
  ].filter((x) => x.toId && Number(x.stars) >= 1);
  for (const it of items) {
    await prisma.rating.upsert({
      where: { orderId_fromId_kind: { orderId: o.id, fromId: s.id, kind: it.kind } },
      update: { stars: Math.min(5, Number(it.stars)), comment: ratings?.comment || null },
      create: { orderId: o.id, fromId: s.id, toId: it.toId, kind: it.kind, stars: Math.min(5, Number(it.stars)), comment: ratings?.comment || null },
    });
  }
  // actualizar promedio del vendedor (snapshot que ordena las cotizaciones)
  const sellerRatings = await prisma.rating.findMany({ where: { toId: o.storeId, kind: { in: ['SELLER', 'PRODUCT'] } }, select: { stars: true } });
  if (sellerRatings.length) {
    const avg = sellerRatings.reduce((a, r) => a + r.stars, 0) / sellerRatings.length;
    await prisma.storeProfile.update({ where: { userId: o.storeId }, data: { ratingAvg: Math.round(avg * 10) / 10, ratingsCount: sellerRatings.length } }).catch(() => {});
  }
  return { ok: true };
}

export async function getMyRatingsForOrder(requestId) {
  const s = await getSession(); if (!s) return null;
  const o = await prisma.order.findUnique({ where: { requestId }, select: { id: true } });
  if (!o) return null;
  const rows = await prisma.rating.findMany({ where: { orderId: o.id, fromId: s.id } });
  return Object.fromEntries(rows.map((r) => [r.kind, r.stars]));
}

// ---- Admin ----
export async function getAdminData() {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return null;
  const [usersCount, reqCount, paid, users, recent] = await Promise.all([
    prisma.user.count(),
    prisma.request.count(),
    prisma.order.findMany({ where: { status: 'PAID' }, select: { commissionAmount: true } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, email: true, name: true, role: true, status: true } }),
    prisma.request.findMany({ orderBy: { createdAt: 'desc' }, take: 15, include: { category: true, order: true } }),
  ]);
  const commission = paid.reduce((a, o) => a + num(o.commissionAmount), 0);
  return {
    kpis: { users: usersCount, requests: reqCount, paid: paid.length, commission },
    users,
    recent: recent.map((r) => ({ id: r.id, code: r.code, label: r.description || r.category?.name || 'Repuesto', vehicle: `${r.brand || ''} ${r.model || ''}`.trim(), status: r.status, total: r.order ? num(r.order.total) : null })),
  };
}
// Alta de usuario desde el backoffice (admin). Crea cuenta + perfil + geocodifica dirección.
export async function createUser(input) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const email = String(input.email || '').trim().toLowerCase();
  const role = input.role;
  if (!email || !role) return { error: 'Email y rol son obligatorios.' };
  if (!['MECHANIC', 'STORE', 'DELIVERY', 'ADMIN'].includes(role)) return { error: 'Rol inválido.' };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: 'Ya existe un usuario con ese email.' };

  const tempPassword = Math.random().toString(36).slice(2, 10);
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Validación de dirección: tiene que existir (geocodificable) y estar en Bariloche.
  // Sin dirección válida no se puede calcular el costo de envío por distancia.
  let coords = null;
  if (role === 'MECHANIC' || role === 'STORE') {
    if (!String(input.address || '').trim()) return { error: 'La dirección es obligatoria para mecánicos y comercios.' };
    coords = await geocode(`${input.address} ${input.barrio || ''}`.trim());
    if (!coords) return { error: 'No encontramos esa dirección. Revisá calle y número (ej: "Av. Bustillo 1240").' };
    if (!inBariloche(coords)) return { error: `Esa dirección no está en Bariloche (encontramos: ${coords.label?.slice(0, 80)}…). Revisala.` };
  }

  try {
    const user = await prisma.user.create({
      data: { email, name: input.name || null, role, status: 'ACTIVE', passwordHash, phone: input.phone || null, whatsapp: input.whatsapp || null, createdById: s.id },
    });
    if (role === 'MECHANIC') {
      await prisma.mechanicProfile.create({ data: { userId: user.id, workshopName: input.name || null, barrio: input.barrio || null, address: input.address || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null } });
    } else if (role === 'STORE') {
      await prisma.storeProfile.create({ data: { userId: user.id, tradeName: input.name || input.tradeName || 'Comercio', legalName: input.legalName || null, cuit: input.cuit || null, ivaCondition: input.ivaCondition || null, address: input.address || null, barrio: input.barrio || null, lat: coords?.lat ?? null, lng: coords?.lng ?? null } });
    } else if (role === 'DELIVERY') {
      // Requisitos estilo Uber: DNI + licencia + seguro + patente. Sin docs completos no puede tomar pedidos.
      const docsOk = !!(input.dni?.trim() && input.licenseNumber?.trim() && input.insurance?.trim());
      await prisma.deliveryProfile.create({ data: { userId: user.id, vehicleType: input.vehicleType || null, plate: input.plate || null, dni: input.dni || null, licenseNumber: input.licenseNumber || null, insurance: input.insurance || null, docsOk } });
    }
    return { ok: true, tempPassword, geocoded: !!coords, geocodedLabel: coords?.label || null };
  } catch (e) {
    return { error: e?.code === 'P2002' ? 'Datos duplicados (CUIT o email ya existen).' : 'No se pudo crear el usuario.' };
  }
}

export async function setUserStatus(userId, status) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  await prisma.user.update({ where: { id: userId }, data: { status } });
  return { ok: true };
}

// ---- Tarifas de envío (backoffice) ----
export async function getShippingTariffs() {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return [];
  const rows = await prisma.shippingTariff.findMany({ orderBy: { uptoKm: 'asc' } });
  return rows.map((r) => ({ uptoKm: r.uptoKm, price: num(r.price) }));
}
export async function saveShippingTariffs(rows) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const clean = (rows || []).map((r) => ({ uptoKm: parseInt(r.uptoKm, 10), price: Math.round(Number(r.price)) || 0 })).filter((r) => r.uptoKm > 0 && r.price > 0);
  await prisma.shippingTariff.deleteMany({});
  if (clean.length) await prisma.shippingTariff.createMany({ data: clean, skipDuplicates: true });
  return { ok: true, count: clean.length };
}
// ---- Comisión y recargo MP (backoffice) ----
export async function getBusinessSettings() {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return null;
  return readSettings();
}
export async function saveBusinessSettings(input) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const entries = [
    ['commissionPct', String(Number(input.commissionPct) || 0)],
    ['mpFeePct', String(Number(input.mpFeePct) || 0)],
    ['mpFeeEnabled', input.mpFeeEnabled ? 'true' : 'false'],
    ['minShip', String(Math.max(0, Number(input.minShip) || 0))],
  ];
  for (const [key, value] of entries) await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  return { ok: true };
}

export async function geocodeAddress(address) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return null;
  return geocode(address);
}

// ================= Cuenta Corriente =================
// --- Mecánico ---
export async function getMyCreditAccounts() {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return [];
  const ccs = await prisma.creditAccount.findMany({ where: { mechanicId: s.id }, orderBy: { createdAt: 'desc' } });
  const stores = await prisma.storeProfile.findMany({ where: { userId: { in: ccs.map((c) => c.storeId) } }, select: { userId: true, tradeName: true } });
  const nameOf = Object.fromEntries(stores.map((st) => [st.userId, st.tradeName]));
  return ccs.map((c) => ({ id: c.id, storeName: nameOf[c.storeId] || 'Comercio', status: creditStatus(c) }));
}

// Comercios disponibles para solicitar CC + estado actual con este mecánico.
export async function getStoresForCredit() {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return [];
  const stores = await prisma.storeProfile.findMany({ select: { userId: true, tradeName: true, barrio: true } });
  const ccs = await prisma.creditAccount.findMany({ where: { mechanicId: s.id } });
  const byStore = Object.fromEntries(ccs.map((c) => [c.storeId, c]));
  return stores.map((st) => ({ storeId: st.userId, name: st.tradeName, barrio: st.barrio, status: byStore[st.userId] ? creditStatus(byStore[st.userId]) : 'NONE' }));
}

export async function requestCreditAccount(storeId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const store = await prisma.user.findFirst({ where: { id: storeId, role: 'STORE' } });
  if (!store) return { error: 'Comercio inválido' };
  await prisma.creditAccount.upsert({
    where: { mechanicId_storeId: { mechanicId: s.id, storeId } },
    update: { adminStatus: 'PENDING', storeStatus: 'PENDING', active: false, disabledAt: null, adminActedAt: null, storeActedAt: null },
    create: { mechanicId: s.id, storeId },
  });
  return { ok: true };
}

// --- Comercio (repuestero) ---
export async function getStoreCreditRequests() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return [];
  const ccs = await prisma.creditAccount.findMany({ where: { storeId: s.id }, orderBy: { createdAt: 'desc' } });
  const mechs = await prisma.mechanicProfile.findMany({ where: { userId: { in: ccs.map((c) => c.mechanicId) } }, select: { userId: true, workshopName: true } });
  const nameOf = Object.fromEntries(mechs.map((m) => [m.userId, m.workshopName]));
  return ccs.map((c) => ({ id: c.id, mechanicName: nameOf[c.mechanicId] || 'Taller', storeStatus: c.storeStatus, status: creditStatus(c) }));
}

export async function storeActOnCredit(id, approve) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const cc = await prisma.creditAccount.findUnique({ where: { id } });
  if (!cc || cc.storeId !== s.id) return { error: 'No autorizado' };
  const storeStatus = approve ? 'APPROVED' : 'REJECTED';
  const active = creditActive(cc.adminStatus, storeStatus, cc.disabledAt);
  await prisma.creditAccount.update({ where: { id }, data: { storeStatus, storeActedAt: new Date(), active } });
  return { ok: true };
}

// --- Admin ---
export async function getCreditRequests() {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return [];
  const ccs = await prisma.creditAccount.findMany({ orderBy: { createdAt: 'desc' } });
  const [mechs, stores] = await Promise.all([
    prisma.mechanicProfile.findMany({ where: { userId: { in: ccs.map((c) => c.mechanicId) } }, select: { userId: true, workshopName: true } }),
    prisma.storeProfile.findMany({ where: { userId: { in: ccs.map((c) => c.storeId) } }, select: { userId: true, tradeName: true } }),
  ]);
  const mName = Object.fromEntries(mechs.map((m) => [m.userId, m.workshopName]));
  const sName = Object.fromEntries(stores.map((st) => [st.userId, st.tradeName]));
  return ccs.map((c) => ({ id: c.id, mechanicName: mName[c.mechanicId] || 'Taller', storeName: sName[c.storeId] || 'Comercio', adminStatus: c.adminStatus, storeStatus: c.storeStatus, adminNote: c.adminNote, status: creditStatus(c) }));
}

export async function adminActOnCredit(id, approve, note) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const cc = await prisma.creditAccount.findUnique({ where: { id } });
  if (!cc) return { error: 'No encontrado' };
  const adminStatus = approve ? 'APPROVED' : 'REJECTED';
  const active = creditActive(adminStatus, cc.storeStatus, cc.disabledAt);
  await prisma.creditAccount.update({ where: { id }, data: { adminStatus, adminNote: note || null, adminActedAt: new Date(), active } });
  return { ok: true };
}

export async function disableCreditAccount(id) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  await prisma.creditAccount.update({ where: { id }, data: { active: false, disabledAt: new Date() } });
  return { ok: true };
}

// ================= Trabajos (pedidos por vehículo) =================
const PLATE_RE = /^([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})$/i; // ABC123 / AB123CD
const normPlate = (p) => String(p || '').toUpperCase().replace(/\s+/g, '');

function jobBase(j) {
  const items = (j.requests || []).map(reqBase);
  return {
    id: j.id, code: j.code, brand: j.brand, model: j.model, year: j.year, plate: j.plate, vin: j.vin,
    status: j.status, windowEndsAt: j.windowEndsAt ? j.windowEndsAt.getTime() : null,
    createdAt: j.createdAt?.getTime() || 0, items,
  };
}

// Crea el Trabajo (borrador) + primer ítem, o agrega un ítem a un trabajo en armado.
export async function addJobItem(input) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  let job = null;
  if (input.jobId) {
    job = await prisma.job.findUnique({ where: { id: input.jobId } });
    if (!job || job.mechanicId !== s.id) return { error: 'Trabajo inválido' };
    if (job.status !== 'DRAFT') return { error: 'Este trabajo ya fue publicado' };
  } else {
    const plate = normPlate(input.plate);
    const hasVin = String(input.vin || '').trim().length === 17;
    if (!PLATE_RE.test(plate) && !hasVin) return { error: 'Cargá la patente (ABC123 o AB123CD) o el VIN completo (17 caracteres). Es clave para consolidar el envío.' };
    // misma patente en otro trabajo abierto con otro vehículo -> probablemente está "inventando"
    if (PLATE_RE.test(plate)) {
      const dup = await prisma.job.findFirst({ where: { mechanicId: s.id, plate, status: { in: ['DRAFT', 'OPEN', 'CLOSED'] } } });
      if (dup && (dup.brand !== input.brand || dup.model !== input.model)) {
        return { error: `La patente ${plate} ya está en el Trabajo #${dup.code} (${dup.brand} ${dup.model}). Revisala.` };
      }
      // mismo vehículo: solo se agrupa si el trabajo sigue EN ARMADO; publicado/en pago no se puede tocar
      if (dup && dup.status === 'DRAFT') { job = dup; }
      else if (dup) return { error: `Ese vehículo ya tiene el Trabajo #${dup.code} en curso (${dup.status === 'OPEN' ? 'cotizando' : 'pendiente de pago'}). Esperá a que termine o desestimalo antes de crear otro.` };
    }
    if (job) {
      const res0 = await createRequest({ ...input, _jobId: job.id, _noWindow: true });
      if (res0?.error) return res0;
      return { ok: true, jobId: job.id, itemId: res0.id, joined: true };
    }
    // código legible con reintento (dos trabajos a la vez no pueden chocar el unique)
    const n = await prisma.job.count();
    let created = null;
    for (let attempt = 0; attempt < 6 && !created; attempt++) {
      try {
        created = await prisma.job.create({
          data: {
            code: 'T-' + (100 + n + attempt * 7 + Math.floor(Math.random() * 50)),
            mechanicId: s.id, brand: input.brand || null, model: input.model || null,
            year: input.year ? parseInt(input.year, 10) : null,
            plate: PLATE_RE.test(plate) ? plate : '', vin: input.vin || null, status: 'DRAFT',
          },
        });
      } catch (e) { if (e?.code !== 'P2002') throw e; }
    }
    if (!created) return { error: 'No se pudo crear el trabajo, reintentá.' };
    job = created;
  }
  const res = await createRequest({ ...input, _jobId: job.id, _noWindow: true });
  if (res?.error) return res;
  return { ok: true, jobId: job.id, itemId: res.id };
}

// "Eso es todo" -> publica el trabajo: arranca UNA ventana de 10 min para todos los ítems.
export async function publishJob(jobId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { requests: true } });
  if (!job || job.mechanicId !== s.id) return { error: 'No autorizado' };
  if (job.requests.length === 0) return { error: 'Agregá al menos un repuesto' };
  const ends = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.job.update({ where: { id: jobId }, data: { status: 'OPEN', windowEndsAt: ends } });
  await prisma.request.updateMany({ where: { jobId }, data: { windowEndsAt: ends, status: 'OPEN' } });
  return { ok: true };
}

export async function closeJobWindow(jobId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job || job.mechanicId !== s.id) return { error: 'No autorizado' };
  const now = new Date();
  await prisma.job.update({ where: { id: jobId }, data: { windowEndsAt: now } });
  await prisma.request.updateMany({ where: { jobId }, data: { windowEndsAt: now } });
  return { ok: true };
}

export async function getMyJobs() {
  const s = await getSession(); if (!s) return [];
  await expireUnpaid();
  // borradores sin tocar por 24hs -> cancelados; trabajos con link generado y sin pagar 24hs -> cancelados
  await prisma.job.updateMany({ where: { status: 'DRAFT', updatedAt: { lt: new Date(Date.now() - 86400000) } }, data: { status: 'CANCELLED' } }).catch(() => {});
  await prisma.job.updateMany({ where: { status: 'CLOSED', selectedAt: { lt: new Date(Date.now() - 86400000) } }, data: { status: 'CANCELLED' } }).catch(() => {});
  const jobs = await prisma.job.findMany({ where: { mechanicId: s.id }, orderBy: { createdAt: 'desc' }, include: { requests: { include: { category: true } } } });
  return jobs.map(jobBase);
}

export async function getJob(jobId) {
  const s = await getSession(); if (!s) return null;
  const j = await prisma.job.findUnique({ where: { id: jobId }, include: { requests: { include: { category: true, quotes: true } } } });
  if (!j || j.mechanicId !== s.id) return null;
  const cc = await prisma.creditAccount.findMany({ where: { mechanicId: s.id, active: true }, select: { storeId: true } });
  const ccSet = new Set(cc.map((c) => c.storeId));
  const base = jobBase(j);
  base.items = j.requests.map((r) => {
    const sel = r.quotes.find((q) => q.status === 'SELECTED') || null;
    return {
      ...reqBase(r),
      quotesCount: r.quotes.length,
      selected: sel ? quotePublic(sel) : null,
      useCredit: r.useCredit,
      creditEligible: !!sel && ccSet.has(sel.storeId), // CC activa con el comercio elegido
    };
  });
  return base;
}

// Marca/desmarca un ítem para pagar con cuenta corriente (verifica CC activa real).
export async function setItemCredit(itemId, on) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const r = await prisma.request.findUnique({ where: { id: itemId }, include: { quotes: true, job: true } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  if (r.job && ['CLOSED', 'PAID'].includes(r.job.status)) return { error: 'El link de pago ya fue generado; no se puede cambiar' };
  if (on) {
    const sel = r.quotes.find((q) => q.status === 'SELECTED');
    if (!sel) return { error: 'Primero elegí una cotización' };
    const cc = await prisma.creditAccount.findFirst({ where: { mechanicId: s.id, storeId: sel.storeId, active: true } });
    if (!cc) return { error: 'No tenés cuenta corriente activa con ese comercio' };
  }
  await prisma.request.update({ where: { id: itemId }, data: { useCredit: !!on } });
  return { ok: true };
}

// Checkout del trabajo: UN link por todos los ítems elegidos.
// Envío: UNO por comercio involucrado (consolidación básica del DeliveryGroup).
export async function createJobCheckout(jobId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const j = await prisma.job.findUnique({ where: { id: jobId }, include: { requests: { include: { quotes: true } } } });
  if (!j || j.mechanicId !== s.id) return { error: 'No autorizado' };
  if (['CANCELLED', 'PAID', 'DONE'].includes(j.status)) return { error: 'Este trabajo ya no admite pagos' };
  const chosen = [];
  for (const r of j.requests) {
    const sel = r.quotes.find((q) => q.status === 'SELECTED');
    if (sel && !['PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(r.status)) chosen.push({ req: r, quote: sel });
  }
  if (chosen.length === 0) return { error: 'Elegí al menos una cotización' };

  const settings = await readSettings();
  let parts = 0, creditParts = 0, commission = 0;
  for (const c of chosen) {
    const part = num(c.quote.price) || 0;
    // ítems a cuenta corriente: el repuesto NO se cobra por la app (lo liquida el comercio),
    // pero la comisión y el envío sí
    if (c.req.useCredit) creditParts += part; else parts += part;
    commission += Math.round(part * (Number(settings.commissionPct) / 100));
  }
  // un envío por comercio distinto
  const stores = [...new Set(chosen.map((c) => c.quote.storeId))];
  let ship = 0;
  for (const storeId of stores) ship += await computeShip(chosen.find((c) => c.quote.storeId === storeId).req.id, storeId);
  const sub = parts + commission + ship;
  const mpFee = settings.mpFeeEnabled ? Math.round(sub * (Number(settings.mpFeePct) / 100)) : 0;
  const total = sub + mpFee;
  const amount = process.env.MP_TEST_AMOUNT ? Number(process.env.MP_TEST_AMOUNT) : total;

  const h = headers();
  const host = h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  try {
    const { link } = await createPaymentLink({
      orderRef: `job::${jobId}`,
      title: `Repuestos · Trabajo #${j.code} · ${j.brand || ''} ${j.model || ''} ${j.plate || ''}`.trim(),
      amount,
      backUrl: `${proto}://${host}/api/mp/return`,
      notificationUrl: `${proto}://${host}/api/mp/webhook`,
    });
    await prisma.job.update({ where: { id: jobId }, data: { selectedAt: new Date(), status: 'CLOSED' } });
    return { link, breakdown: { parts, creditParts, commission, ship, mpFee, total, stores: stores.length, items: chosen.length } };
  } catch (e) {
    return { error: e?.message || 'No se pudo generar el link de pago.' };
  }
}

// ---- Repartidor: aviso de llegada e incidencias ----
export async function reportArrival(orderId, stage) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryId: true, status: true } });
  if (!o || o.deliveryId !== s.id) return { error: 'Este pedido no está asignado a vos' };
  if (stage === 'pickup' && o.status === 'PAID') await prisma.order.update({ where: { id: orderId }, data: { arrivedPickupAt: new Date() } });
  else if (stage === 'drop' && o.status === 'SHIPPED') await prisma.order.update({ where: { id: orderId }, data: { arrivedDropAt: new Date() } });
  else return { error: 'Etapa inválida' };
  return { ok: true };
}

export async function reportIssue(orderId, text) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryId: true } });
  if (!o || o.deliveryId !== s.id) return { error: 'Este pedido no está asignado a vos' };
  await prisma.order.update({ where: { id: orderId }, data: { issue: String(text || 'Nadie me atendió').slice(0, 200), issueAt: new Date() } });
  return { ok: true };
}

// ---- Mecánico: desestimar un ítem del trabajo (antes de generar el link) ----
export async function cancelItem(itemId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const r = await prisma.request.findUnique({ where: { id: itemId }, include: { job: true } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  if (['PAID', 'SHIPPED', 'DELIVERED'].includes(r.status)) return { error: 'Este ítem ya fue pagado' };
  if (r.job && ['CLOSED', 'PAID'].includes(r.job.status)) return { error: 'El link de pago ya fue generado; cancelá el trabajo completo' };
  await prisma.request.update({ where: { id: itemId }, data: { status: 'CANCELLED' } });
  return { ok: true };
}
