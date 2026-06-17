'use server';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession, invalidateStatusCache } from '@/lib/session';
import { createPaymentLink } from '@/lib/mercadopago';
import { jobChargePlan } from '@/lib/orders';
import { getSettings as readSettings } from '@/lib/settings';
import { geocode, inBariloche, searchBariloche } from '@/lib/geo';
import { creditStatus, creditActive } from '@/lib/credit';
import { parsePrice } from '@/lib/money';
import { aliasLabel } from '@/lib/alias';
import { sendPush, sendPushMany } from '@/lib/push';

const URGENCY = { 'Necesito ahora': 'AHORA', Hoy: 'HOY', 'Mañana': 'MANANA' };
const URGENCY_LABEL = { AHORA: 'Necesito ahora', HOY: 'Hoy', MANANA: 'Mañana' };

// Texto libre con tope: estos campos viajan en cada poll de cada panel; sin tope,
// un texto gigante (pegado por error) engorda todas las respuestas.
const txt = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };


const num = (d) => (d == null ? null : Number(d));

function reqBase(r) {
  return {
    id: r.id, code: r.code, brand: r.brand, model: r.model, year: r.year, vin: r.vin,
    engine: r.extraInfo, // motor / versión (campo libre)
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
// rating null = comercio todavía sin calificaciones (la UI muestra "Nuevo", no un número inventado)
function quotePublic(q, creditEligible = false) {
  return { id: q.id, alias: q.alias, optionLabel: q.optionLabel, partBrand: q.partBrand, price: num(q.price), warranty: q.warranty, note: q.note, photoUrls: q.photoUrls || [], rating: q.ratingSnapshot == null ? null : num(q.ratingSnapshot), status: q.status, creditEligible };
}

export async function getMe() {
  const s = await getSession();
  return s ? { id: s.id, email: s.email, role: s.role, name: s.name } : null;
}

// ---- Web Push (PWA) ----
// Guarda la suscripción del navegador del usuario (una por dispositivo, identificada por endpoint).
export async function savePushSubscription(sub) {
  const s = await getSession(); if (!s) return { error: 'No autorizado' };
  const endpoint = sub?.endpoint; const p256dh = sub?.keys?.p256dh; const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { error: 'Suscripción inválida' };
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: s.id, p256dh, auth },
    create: { userId: s.id, endpoint, p256dh, auth },
  });
  return { ok: true };
}

export async function deletePushSubscription(endpoint) {
  const s = await getSession(); if (!s || !endpoint) return { error: 'No autorizado' };
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: s.id } });
  return { ok: true };
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
    brand: txt(input.brand, 60), model: txt(input.model, 60), year: input.year ? parseInt(input.year, 10) : null, vin: txt(input.vin, 17),
    extraInfo: txt(input.engine, 60), // motor / versión (campo libre) -> ayuda a cotizar el repuesto correcto
    categoryId, description: txt(input.desc, 500),
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
  await sweepExpirations();
  const rows = await prisma.request.findMany({ where: { mechanicId: s.id }, orderBy: { createdAt: 'desc' }, include: { category: true } });
  return rows.map(reqBase);
}

export async function getRequestForMechanic(id) {
  const s = await getSession(); if (!s) return null;
  // mejor calificado primero; los comercios sin calificaciones (snapshot null) van al final
  const r = await prisma.request.findUnique({ where: { id }, include: { category: true, quotes: { orderBy: { ratingSnapshot: { sort: 'desc', nulls: 'last' } } } } });
  if (!r || r.mechanicId !== s.id) return null;
  // cuentas corrientes activas del mecánico (para etiquetar ofertas sin revelar identidad)
  const cc = await prisma.creditAccount.findMany({ where: { mechanicId: s.id, active: true }, select: { storeId: true } });
  const ccSet = new Set(cc.map((c) => c.storeId));
  return { ...reqBase(r), jobId: r.jobId, quotes: r.quotes.map((q) => quotePublic(q, ccSet.has(q.storeId))) };
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
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: { include: { job: true } } } });
  if (!q || q.request.mechanicId !== s.id) return { error: 'No autorizado' };
  // guard de estado: una pestaña vieja no puede cambiar la elección de algo pagado/cancelado
  if (!['OPEN', 'QUOTED', 'CLOSED'].includes(q.request.status)) return { error: 'Este pedido ya no admite cambios' };
  if (q.request.job && !['DRAFT', 'OPEN'].includes(q.request.job.status)) return { error: 'El link de pago ya fue generado: la elección está bloqueada' };
  if (q.request.windowEndsAt && q.request.windowEndsAt.getTime() > Date.now()) return { error: 'Esperá a que cierre la ventana para elegir' };
  // transacción: des-seleccionar otras + seleccionar esta + cerrar request (un doble-tap no deja 2 SELECTED)
  await prisma.$transaction([
    prisma.requestQuote.updateMany({ where: { requestId: q.requestId, status: 'SELECTED' }, data: { status: 'SENT' } }),
    prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } }),
    prisma.request.update({ where: { id: q.requestId }, data: { status: 'CLOSED', selectedAt: new Date() } }),
  ]);
  // push al comercio: el mecánico eligió su oferta
  await sendPush(q.storeId, { title: 'Te eligieron tu cotización 🎉', body: 'El mecánico eligió tu oferta. Cuando pague, coordinamos el flete.', url: '/comercio', tag: 'elegida-' + q.requestId }).catch(() => {});
  return { ok: true, requestId: q.requestId, quoteId };
}

// Expiraciones perezosas (sin cron): si no se pagó en 24hs, se cancela. Corre al leer, pero
// como mucho 1 vez cada 30s por instancia para no hacer 3 writes en CADA poll de CADA cliente
// (con TTL de 24hs, 30s de atraso es irrelevante). En modo test (MP_TEST_AMOUNT) NO throttlea,
// así los E2E que adelantan el reloj ven la cancelación al instante. Post-MVP: pasar a un cron.
const PAY_TTL_MS = 24 * 60 * 60 * 1000;
let lastSweepAt = 0;
async function sweepExpirations() {
  if (!process.env.MP_TEST_AMOUNT && Date.now() - lastSweepAt < 30000) return;
  lastSweepAt = Date.now();
  const cutoff = new Date(Date.now() - PAY_TTL_MS);
  try {
    // ítem elegido y sin pagar -> cancelado. NO toca ítems cuyo trabajo ya tiene link generado
    // (job CLOSED): ese reloj corre por el trabajo (abajo); si no, se descalzan los dos relojes
    // y queda un ítem cancelado con un link todavía pagable.
    await prisma.request.updateMany({
      where: { status: 'CLOSED', selectedAt: { lt: cutoff }, OR: [{ jobId: null }, { job: { status: { not: 'CLOSED' } } }] },
      data: { status: 'CANCELLED' },
    });
    // borradores sin tocar por 24hs -> cancelados; con link generado y sin pagar 24hs -> cancelados
    await prisma.job.updateMany({ where: { status: 'DRAFT', updatedAt: { lt: cutoff } }, data: { status: 'CANCELLED' } });
    await prisma.job.updateMany({ where: { status: 'CLOSED', selectedAt: { lt: cutoff } }, data: { status: 'CANCELLED' } });
  } catch {}
}

// El mecánico vuelve a publicar un pedido (cancelado, entregado o el que sea) con los mismos datos.
export async function duplicateRequest(id) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const r = await prisma.request.findUnique({ where: { id }, include: { job: true } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  const v = r.job || r; // datos del vehículo (del trabajo, o del request si fuera legacy)
  const res = await addJobItem({
    brand: v.brand, model: v.model, year: v.year ? String(v.year) : '',
    plate: v.plate || '', vin: v.vin || '',
    desc: r.description, urgency: URGENCY_LABEL[r.urgency], photoUrls: r.photoUrls || [],
    invoiceType: r.invoiceType === 'FACTURA_A' ? 'factura_a' : 'consumidor_final',
    emisorRazon: r.invEmisorName, emisorCuit: r.invEmisorCuit,
    solicRazon: r.invBuyerName, solicCuit: r.invBuyerCuit,
    _categoryId: r.categoryId,
  });
  if (res?.error) return res;
  await publishJob(res.jobId);
  return { ok: true, jobId: res.jobId };
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
    // la ventana es del TRABAJO: reabrir reabre todos los ítems aún sin comprar.
    // Solo si el trabajo sigue vivo (no pagado/cancelado/con link generado).
    const job = await prisma.job.findUnique({ where: { id: r.jobId }, select: { status: true } });
    if (!job || !['OPEN', 'DRAFT'].includes(job.status)) return { error: 'Este trabajo ya no admite reabrir la ventana' };
    await prisma.job.update({ where: { id: r.jobId }, data: { status: 'OPEN', windowEndsAt: ends } }).catch(() => {});
    await prisma.request.updateMany({ where: { jobId: r.jobId, status: { in: ['OPEN', 'QUOTED', 'CLOSED'] } }, data: { status: 'OPEN', windowEndsAt: ends } });
  } else {
    const cur = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true } });
    if (!cur || !['OPEN', 'QUOTED', 'CLOSED'].includes(cur.status)) return { error: 'Este pedido ya no admite reabrir' };
    await prisma.request.update({ where: { id: requestId }, data: { status: 'OPEN', windowEndsAt: ends } });
  }
  return { ok: true };
}


async function ccActiveBetween(mechanicId, storeId) {
  const cc = await prisma.creditAccount.findFirst({ where: { mechanicId, storeId, active: true }, select: { id: true } });
  return !!cc;
}

// ---- Comercio (vendedor) ----
export async function getOpenRequestsForStore() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return [];
  await sweepExpirations();
  // categorías que vende el comercio: solo le llegan pedidos de esas. Si no configuró ninguna,
  // ve todas (no lo dejamos a ciegas hasta que el admin se las cargue).
  const myCats = await prisma.storeCategory.findMany({ where: { storeId: s.id }, select: { categoryId: true } });
  const catIds = myCats.map((c) => c.categoryId);
  const openWhere = { status: { in: ['OPEN', 'QUOTED'] }, windowEndsAt: { not: null } };
  if (catIds.length) openWhere.categoryId = { in: catIds };
  const rows = await prisma.request.findMany({
    where: {
      OR: [
        // publicadas (los borradores de trabajos no tienen ventana y no se ven), filtradas por mis rubros
        openWhere,
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
  // nombre del mecánico (taller): en ventas ya concretadas no hay anonimato — el comercio necesita
  // saber a quién le vendió, sobre todo para las que van a cuenta corriente.
  const mechIds = [...new Set(orders.map((o) => o.mechanicId))];
  const mechs = await prisma.mechanicProfile.findMany({ where: { userId: { in: mechIds } }, select: { userId: true, workshopName: true } });
  const mechName = Object.fromEntries(mechs.map((m) => [m.userId, m.workshopName]));
  return orders.map((o) => ({
    orderId: o.id, orderStatus: o.status, hasDelivery: !!o.deliveryId, creditAccount: o.creditAccount,
    creditSettledAt: o.creditSettledAt ? o.creditSettledAt.getTime() : null,
    soldAt: o.createdAt?.getTime() || 0, mechanicName: mechName[o.mechanicId] || 'Taller',
    arrivedPickup: !!o.arrivedPickupAt, issue: o.issue || null, total: num(o.total), part: num(o.partAmount), ...reqBase(o.request),
  }));
}

// Datos del comercio para su vista de perfil (SOLO LECTURA): sus datos + los rubros que vende.
export async function getMyStoreProfile() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return null;
  const [u, prof, cats] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.id }, select: { email: true, name: true, phone: true, whatsapp: true } }),
    prisma.storeProfile.findUnique({ where: { userId: s.id } }),
    prisma.storeCategory.findMany({ where: { storeId: s.id }, select: { category: { select: { name: true } } } }),
  ]);
  return {
    email: u?.email || null, name: u?.name || null, phone: u?.phone || null, whatsapp: u?.whatsapp || null,
    tradeName: prof?.tradeName || null, legalName: prof?.legalName || null, cuit: prof?.cuit || null,
    ivaCondition: prof?.ivaCondition || null, invoiceType: prof?.invoiceType || null, partCondition: prof?.partCondition || null,
    address: prof?.address || null, barrio: prof?.barrio || null,
    rating: prof && prof.ratingsCount > 0 ? num(prof.ratingAvg) : null, ratingsCount: prof?.ratingsCount || 0, points: prof?.points || 0,
    categories: cats.map((c) => c.category?.name).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')),
  };
}

// El comercio marca (o desmarca) una venta en cuenta corriente como "procesada internamente"
// en su sistema/contabilidad. No mueve plata: es un control de seguimiento del cobro al taller.
export async function markCreditSettled(orderId, settled = true) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true, creditAccount: true } });
  if (!o || o.storeId !== s.id) return { error: 'Venta no encontrada' };
  if (!o.creditAccount) return { error: 'Esta venta no es en cuenta corriente.' };
  await prisma.order.update({ where: { id: orderId }, data: { creditSettledAt: settled ? new Date() : null } });
  return { ok: true };
}

export async function createQuote(requestId, input) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true, windowEndsAt: true, jobId: true, mechanicId: true } });
  if (!req) return { error: 'Solicitud no encontrada' };
  if (!['OPEN', 'QUOTED'].includes(req.status)) return { error: 'La solicitud ya no admite cotizaciones' };
  if (req.windowEndsAt && req.windowEndsAt.getTime() < Date.now()) return { error: 'La ventana de cotización ya cerró' };
  // El repuestero puede enviar varias opciones (ej. Original / Alternativa), hasta un tope.
  const MAX_OPCIONES = 3;
  const mine = await prisma.requestQuote.count({ where: { requestId, storeId: s.id } });
  if (mine >= MAX_OPCIONES) return { error: `Podés enviar hasta ${MAX_OPCIONES} opciones por solicitud` };
  if (parsePrice(input.price) <= 0) return { error: 'Ingresá un precio válido' };
  const store = await prisma.storeProfile.findUnique({ where: { userId: s.id } });
  // alias rotativo por trabajo: reuso el mío si ya coticé acá; si no, soy el próximo en orden de llegada
  const scope = req.jobId ? { request: { jobId: req.jobId } } : { requestId };
  let alias;
  const previas = await prisma.requestQuote.findMany({ where: scope, select: { storeId: true, alias: true }, orderBy: { createdAt: 'asc' } });
  const mineAlias = previas.find((q) => q.storeId === s.id)?.alias;
  if (mineAlias) alias = mineAlias;
  else alias = aliasLabel([...new Set(previas.map((q) => q.storeId))].length);
  await prisma.requestQuote.create({
    data: {
      requestId, storeId: s.id, alias,
      optionLabel: input.optionLabel || null,
      partBrand: txt(input.partBrand, 80), price: parsePrice(input.price),
      warranty: txt(input.warranty, 60) || '6 meses', note: txt(input.note, 300),
      // snapshot honesto: solo si el comercio tiene calificaciones reales (si no, null = "Nuevo")
      ratingSnapshot: store && store.ratingsCount > 0 ? store.ratingAvg : null, photoUrls: input.photoUrls || [],
    },
  });
  await prisma.request.update({ where: { id: requestId }, data: { status: 'QUOTED' } }).catch(() => {});
  // push al mecánico: llegó una cotización (tag por pedido -> coalesce si llegan varias)
  await sendPush(req.mechanicId, { title: 'Llegó una cotización 🏷️', body: 'Tenés una oferta nueva para tu pedido. Revisala.', url: '/mecanico', tag: 'cotiz-' + requestId }).catch(() => {});
  return { ok: true };
}

// ---- Repartidor ----
export async function getMyDeliveries() {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return [];
  // disponibles (sin repartidor asignado) + las mías en curso
  const orders = await prisma.order.findMany({
    where: { OR: [{ status: 'PAID', deliveryId: null }, { deliveryId: s.id, status: { in: ['PAID', 'SHIPPED'] } }] },
    orderBy: { createdAt: 'desc' },
    include: { request: { include: { category: true, job: { select: { plate: true } } } } },
  });
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const mechIds = [...new Set(orders.map((o) => o.mechanicId))];
  const [stores, mechs] = await Promise.all([
    prisma.storeProfile.findMany({ where: { userId: { in: storeIds } }, select: { userId: true, tradeName: true, address: true, barrio: true, lat: true, lng: true } }),
    prisma.mechanicProfile.findMany({ where: { userId: { in: mechIds } }, select: { userId: true, workshopName: true, address: true, barrio: true, lat: true, lng: true } }),
  ]);
  const sMap = Object.fromEntries(stores.map((x) => [x.userId, x]));
  const mMap = Object.fromEntries(mechs.map((x) => [x.userId, x]));
  // VIAJE = patente + mecánico. Un auto puede juntar repuestos de VARIOS comercios -> el viaje tiene
  // varios RETIROS (uno por comercio) y UNA entrega al taller, con un solo flete y PIN de retiro.
  const trips = new Map();
  for (const o of orders) {
    const mine = o.deliveryId === s.id;
    const plate = o.request?.job?.plate || o.requestId; // sin patente -> la orden es su propio viaje
    const key = `${mine ? 'mine' : 'avail'}::${plate}::${o.mechanicId}`;
    if (!trips.has(key)) {
      trips.set(key, {
        tripId: key, mine, plate: o.request?.job?.plate || null,
        veh: `${o.request?.brand || ''} ${o.request?.model || ''}`.trim() || 'Vehículo',
        orderIds: [], pickupsMap: new Map(), freight: 0, anyPaid: false, arrivedDrop: false, issue: null,
        pickupPin: mine ? o.pickupPin : null,
        dropoff: mMap[o.mechanicId] ? { name: mMap[o.mechanicId].workshopName, address: mMap[o.mechanicId].address, barrio: mMap[o.mechanicId].barrio, lat: num(mMap[o.mechanicId].lat), lng: num(mMap[o.mechanicId].lng) } : null,
      });
    }
    const t = trips.get(key);
    t.orderIds.push(o.id);
    t.freight += num(o.freightAmount) || 0; // el flete único quedó en un solo ítem -> la suma es ese flete
    if (o.status === 'PAID') t.anyPaid = true;
    if (o.arrivedDropAt) t.arrivedDrop = true;
    if (o.issue && !t.issue) t.issue = o.issue;
    // retiro por comercio
    if (!t.pickupsMap.has(o.storeId)) {
      t.pickupsMap.set(o.storeId, {
        storeId: o.storeId, orderId: o.id, // orden representativa para disparar las acciones del retiro
        name: sMap[o.storeId]?.tradeName, address: sMap[o.storeId]?.address, barrio: sMap[o.storeId]?.barrio,
        lat: num(sMap[o.storeId]?.lat), lng: num(sMap[o.storeId]?.lng),
        items: [], allPicked: true, arrived: false,
      });
    }
    const pk = t.pickupsMap.get(o.storeId);
    pk.items.push({ orderId: o.id, label: o.request?.description || o.request?.category?.name || 'Repuesto', code: o.request?.code });
    if (o.status === 'PAID') pk.allPicked = false; // todavía no retirado de ese comercio
    if (o.arrivedPickupAt) pk.arrived = true;
  }
  return [...trips.values()].map((t) => {
    const pickups = [...t.pickupsMap.values()];
    return {
      tripId: t.tripId, mine: t.mine, plate: t.plate, veh: t.veh, orderIds: t.orderIds,
      freight: t.freight, pickupPin: t.pickupPin, dropoff: t.dropoff, issue: t.issue, arrivedDrop: t.arrivedDrop,
      pickups, itemsCount: pickups.reduce((a, p) => a + p.items.length, 0),
      allPicked: pickups.every((p) => p.allPicked), // todo retirado -> listo para entregar
      status: t.anyPaid ? 'PAID' : 'SHIPPED',
    };
  });
}

const newPin = () => String(Math.floor(1000 + Math.random() * 9000)); // 4 dígitos

// Un VIAJE es por PATENTE + MECÁNICO: el mismo auto puede juntar repuestos de VARIOS comercios y
// se entrega TODO en un solo viaje al taller (un flete por patente). El claim agrupa con el mismo
// deliveryId y PINs. La ENTREGA/llegada-al-taller son del viaje entero; el RETIRO es por comercio
// (perStore), porque cada comercio entrega lo suyo. Sin patente (legacy), cae a la orden sola.
function tripWhere(o, { perStore = false } = {}) {
  const plate = o.request?.job?.plate;
  if (plate && o.deliveryId) {
    const w = { deliveryId: o.deliveryId, mechanicId: o.mechanicId, request: { job: { plate } } };
    if (perStore) w.storeId = o.storeId; // acota a los ítems de ESE comercio (retiro por comercio)
    return w;
  }
  return { id: o.id };
}
const TRIP_INCLUDE = { request: { select: { jobId: true, job: { select: { plate: true } } } } };

// Tomar pedido — claim ATÓMICO: el updateMany con deliveryId:null garantiza que
// solo UN repartidor puede quedárselo aunque varios toquen el botón a la vez.
// Genera los 2 PINs: retiro (verifica el vendedor) y entrega (verifica el mecánico).
export async function claimDelivery(orderId) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const prof = await prisma.deliveryProfile.findUnique({ where: { userId: s.id }, select: { docsOk: true } });
  if (!prof?.docsOk) return { error: 'Tu cuenta no está habilitada todavía (falta validar tu documentación)' };
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, deliveryId: true, storeId: true, mechanicId: true, request: { select: { job: { select: { plate: true } } } } },
  });
  if (!o) return { error: 'Pedido no encontrado' };
  if (o.deliveryId) return { error: 'Otro repartidor ya tomó este pedido' };
  if (o.status !== 'PAID') return { error: 'Este pedido ya no está disponible' };
  // CONSOLIDACIÓN POR PATENTE + MECÁNICO: el viaje es del AUTO. Se toman JUNTAS todas las órdenes
  // pagadas sin repartidor de la MISMA patente + MISMO mecánico (destino), AUNQUE sean de varios
  // comercios: el repartidor recoge en cada comercio y entrega todo junto al taller (un solo flete).
  // No se incluye el comercio en la clave: el mismo auto puede comprar en varias casas de repuestos.
  // Sin patente válida (legacy) se toma solo esta orden.
  const plate = (o.request?.job?.plate || '').trim();
  const where = plate
    ? { deliveryId: null, status: 'PAID', mechanicId: o.mechanicId, request: { job: { plate } } }
    : { id: orderId, deliveryId: null, status: 'PAID' };
  // un solo viaje => un solo par de PINs (el de retiro lo usan todos los comercios; el de entrega, el taller)
  const r = await prisma.order.updateMany({ where, data: { deliveryId: s.id, pickupPin: newPin(), deliveryPin: newPin() } });
  if (r.count === 0) return { error: 'Otro repartidor ya tomó este pedido' };
  return { ok: true };
}

// El VENDEDOR confirma que le entregó la pieza al repartidor, verificando el PIN de retiro
// que le muestra el repartidor (garantiza que es el que tomó el pedido).
export async function storeConfirmPickup(orderId, pin) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { storeId: true, mechanicId: true, deliveryId: true, status: true, pickupPin: true, requestId: true, ...TRIP_INCLUDE } });
  if (!o || o.storeId !== s.id) return { error: 'No autorizado' };
  if (!o.deliveryId) return { error: 'Ningún repartidor tomó este pedido todavía' };
  if (o.status !== 'PAID') return { error: 'Este pedido ya fue retirado' };
  if (String(pin).trim() !== o.pickupPin) return { error: 'PIN incorrecto. Pedile el PIN al repartidor.' };
  // un solo PIN confirma el RETIRO de TODO el viaje (todos los ítems de ese auto en este comercio)
  const where = { ...tripWhere(o), status: 'PAID', storeId: s.id };
  const trip = await prisma.order.findMany({ where, select: { requestId: true } });
  await prisma.order.updateMany({ where, data: { status: 'SHIPPED', pickedAt: new Date() } });
  await prisma.request.updateMany({ where: { id: { in: trip.map((t) => t.requestId) } }, data: { status: 'SHIPPED' } }).catch(() => {});
  return { ok: true };
}

// El REPARTIDOR confirma la entrega ingresando el PIN que le da el mecánico en mano.
export async function markDelivered(orderId, pin) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryId: true, mechanicId: true, status: true, deliveryPin: true, requestId: true, storeId: true, ...TRIP_INCLUDE } });
  if (!o || o.deliveryId !== s.id) return { error: 'Este pedido no está asignado a vos' };
  if (o.status !== 'SHIPPED') return { error: 'Primero el vendedor tiene que confirmar el retiro' };
  if (String(pin).trim() !== o.deliveryPin) return { error: 'PIN incorrecto. Pedíselo al mecánico.' };
  // no se entrega si todavía falta RETIRAR piezas de algún comercio del viaje
  const pend = await prisma.order.count({ where: { ...tripWhere(o), deliveryId: s.id, status: 'PAID' } });
  if (pend > 0) return { error: 'Todavía faltan retirar piezas de algún comercio. Retirá todo antes de entregar.' };
  // un solo PIN entrega TODO el viaje (todos los ítems del auto). Comparten el deliveryPin.
  const where = { ...tripWhere(o), deliveryId: s.id, status: 'SHIPPED', deliveryPin: o.deliveryPin };
  const trip = await prisma.order.findMany({ where, select: { id: true, requestId: true, storeId: true } });
  const upd = await prisma.order.updateMany({ where, data: { status: 'DELIVERED', deliveredAt: new Date() } });
  if (upd.count === 0) return { error: 'Este pedido ya fue entregado' };
  await prisma.request.updateMany({ where: { id: { in: trip.map((t) => t.requestId) } }, data: { status: 'DELIVERED' } }).catch(() => {});
  // si ya se entregaron TODOS los ítems comprados del trabajo, pasa a ENTREGADO (DONE).
  if (o.request?.jobId) {
    const pendientes = await prisma.request.count({ where: { jobId: o.request.jobId, status: { in: ['PAID', 'SHIPPED'] } } });
    if (pendientes === 0) await prisma.job.update({ where: { id: o.request.jobId }, data: { status: 'DONE' } }).catch(() => {});
  }
  // venta concretada: +1 punto por ítem; cada comercio suma por LO SUYO, el repartidor por el viaje
  const perStore = {};
  for (const t of trip) perStore[t.storeId] = (perStore[t.storeId] || 0) + 1;
  for (const [storeId, n] of Object.entries(perStore)) await prisma.storeProfile.update({ where: { userId: storeId }, data: { points: { increment: n } } }).catch(() => {});
  await prisma.deliveryProfile.update({ where: { userId: s.id }, data: { points: { increment: upd.count } } }).catch(() => {});
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
      update: { stars: Math.min(5, Number(it.stars)), comment: txt(ratings?.comment, 300) },
      create: { orderId: o.id, fromId: s.id, toId: it.toId, kind: it.kind, stars: Math.min(5, Number(it.stars)), comment: txt(ratings?.comment, 300) },
    });
  }
  // actualizar promedio del vendedor (snapshot que ordena las cotizaciones)
  const sellerRatings = await prisma.rating.findMany({ where: { toId: o.storeId, kind: { in: ['SELLER', 'PRODUCT'] } }, select: { stars: true } });
  if (sellerRatings.length) {
    const avg = sellerRatings.reduce((a, r) => a + r.stars, 0) / sellerRatings.length;
    await prisma.storeProfile.update({ where: { userId: o.storeId }, data: { ratingAvg: Math.round(avg * 10) / 10, ratingsCount: sellerRatings.length } }).catch(() => {});
  }
  // actualizar promedio del repartidor (su reputación, visible en su panel)
  if (o.deliveryId) {
    const dRatings = await prisma.rating.findMany({ where: { toId: o.deliveryId, kind: 'DELIVERY' }, select: { stars: true } });
    if (dRatings.length) {
      const dAvg = dRatings.reduce((a, r) => a + r.stars, 0) / dRatings.length;
      await prisma.deliveryProfile.update({ where: { userId: o.deliveryId }, data: { ratingAvg: Math.round(dAvg * 10) / 10, ratingsCount: dRatings.length } }).catch(() => {});
    }
  }
  return { ok: true };
}

// Reputación propia (vendedor o repartidor): promedio, cantidad de reseñas y puntos por ventas concretadas.
export async function getMyReputation() {
  const s = await getSession(); if (!s) return null;
  const table = s.role === 'STORE' ? prisma.storeProfile : s.role === 'DELIVERY' ? prisma.deliveryProfile : null;
  if (!table) return null;
  const p = await table.findUnique({ where: { userId: s.id }, select: { ratingAvg: true, ratingsCount: true, points: true } });
  if (!p) return null;
  return { rating: p.ratingsCount > 0 ? num(p.ratingAvg) : null, count: p.ratingsCount, points: p.points };
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
  const [usersCount, reqCount, paid, users, recent, categories, storeRows] = await Promise.all([
    prisma.user.count(),
    prisma.request.count(),
    prisma.order.findMany({ where: { status: 'PAID' }, select: { commissionAmount: true } }),
    prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, email: true, name: true, role: true, status: true } }),
    prisma.request.findMany({ orderBy: { createdAt: 'desc' }, take: 15, include: { category: true, order: true } }),
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, slug: true, name: true } }),
    prisma.storeProfile.findMany({ select: { userId: true, tradeName: true, categories: { select: { categoryId: true } } } }),
  ]);
  const commission = paid.reduce((a, o) => a + num(o.commissionAmount), 0);
  return {
    kpis: { users: usersCount, requests: reqCount, paid: paid.length, commission },
    users,
    categories,
    // comercios con los rubros que tienen asignados (para el editor de categorías)
    stores: storeRows.map((st) => ({ id: st.userId, name: st.tradeName, categoryIds: st.categories.map((c) => c.categoryId) })),
    recent: recent.map((r) => ({ id: r.id, code: r.code, label: r.description || r.category?.name || 'Repuesto', vehicle: `${r.brand || ''} ${r.model || ''}`.trim(), status: r.status, total: r.order ? num(r.order.total) : null })),
  };
}

// El admin define qué rubros vende cada comercio. Solo le van a llegar pedidos de esas categorías.
export async function setStoreCategories(storeId, categoryIds) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const ids = [...new Set((Array.isArray(categoryIds) ? categoryIds : []).map((n) => parseInt(n, 10)).filter(Boolean))];
  await prisma.$transaction([
    prisma.storeCategory.deleteMany({ where: { storeId } }),
    ...(ids.length ? [prisma.storeCategory.createMany({ data: ids.map((categoryId) => ({ storeId, categoryId })), skipDuplicates: true })] : []),
  ]);
  return { ok: true };
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
    // La dirección DEBE elegirse del autocompletado (trae coords exactas). No se geocodifica
    // texto libre: garantiza que el envío se calcula sobre una dirección real de Bariloche.
    const picked = input.lat != null && input.lng != null ? { lat: Number(input.lat), lng: Number(input.lng), label: input.address } : null;
    if (!picked) return { error: 'Elegí la dirección del listado de sugerencias (no la escribas a mano).' };
    if (!inBariloche(picked)) return { error: 'Esa dirección no está en Bariloche. Elegí una del listado.' };
    coords = picked;
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
  invalidateStatusCache(userId);
  return { ok: true };
}

// El admin le pone una contraseña TEMPORAL a un usuario (ej: un comercio que la perdió o recién entra).
// Si no se pasa una, se genera al azar. Devuelve la pass en claro para que el admin se la pase.
export async function setUserTempPassword(userId, password) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } });
  if (!u) return { error: 'Usuario no encontrado' };
  if (u.role === 'ADMIN') return { error: 'No se puede resetear la contraseña de un administrador desde acá.' };
  const pwd = String(password || '').trim() || Math.random().toString(36).slice(2, 10);
  if (pwd.length < 6) return { error: 'La contraseña temporal debe tener al menos 6 caracteres.' };
  const passwordHash = await bcrypt.hash(pwd, 10);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash } });
  return { ok: true, email: u.email, tempPassword: pwd };
}

// El admin corrige/cambia el email de un usuario (ej: un comercio cargado con un typo).
export async function setUserEmail(userId, email) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!u) return { error: 'Usuario no encontrado' };
  if (u.role === 'ADMIN') return { error: 'No se puede cambiar el email de un administrador desde acá.' };
  const next = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) return { error: 'Email inválido.' };
  const dup = await prisma.user.findUnique({ where: { email: next }, select: { id: true } });
  if (dup && dup.id !== userId) return { error: 'Ya existe un usuario con ese email.' };
  await prisma.user.update({ where: { id: userId }, data: { email: next } });
  return { ok: true, email: next };
}

// "Trabajo activo" que impide cambiar el rol (definición estricta): órdenes en curso (sin
// entregar/reembolsar) + trabajos/pedidos abiertos del mecánico + cotizaciones vivas del comercio.
async function activeWorkCount(userId) {
  const [orders, jobs, requests, quotes] = await Promise.all([
    prisma.order.count({ where: { status: { notIn: ['DELIVERED', 'REFUNDED'] }, OR: [{ mechanicId: userId }, { storeId: userId }, { deliveryId: userId }] } }),
    prisma.job.count({ where: { mechanicId: userId, status: { notIn: ['DONE', 'CANCELLED'] } } }),
    prisma.request.count({ where: { mechanicId: userId, status: { notIn: ['DELIVERED', 'CANCELLED', 'EXPIRED'] } } }),
    prisma.requestQuote.count({ where: { storeId: userId, status: 'SENT', request: { status: { in: ['OPEN', 'QUOTED', 'CLOSED'] } } } }),
  ]);
  return orders + jobs + requests + quotes;
}

// El admin lee el detalle completo de un usuario (con su perfil por rol) para editarlo.
export async function getUserDetail(userId) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, role: true, status: true, phone: true, whatsapp: true,
      mechanic: { select: { workshopName: true, barrio: true, address: true, lat: true, lng: true } },
      store: { select: { tradeName: true, cuit: true, ivaCondition: true, barrio: true, address: true, lat: true, lng: true } },
      delivery: { select: { vehicleType: true, plate: true, dni: true, licenseNumber: true, insurance: true } },
    },
  });
  if (!u) return null;
  return { ...u, hasActiveWork: (await activeWorkCount(userId)) > 0 };
}

// El admin edita un usuario: datos básicos + perfil por rol, y puede cambiar el rol (solo si NO tiene
// trabajo activo). Al cambiar de rol se conserva el perfil anterior (no se borra) y se crea/actualiza
// el del nuevo rol. Comercio/mecánico requieren dirección con coords (para calcular el envío).
export async function updateUser(userId, input) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
  if (!u) return { error: 'Usuario no encontrado' };
  if (u.role === 'ADMIN') return { error: 'No se puede editar un administrador desde acá.' };

  // ---- validaciones (antes de escribir nada) ----
  const data = {};
  if ('name' in input) data.name = txt(input.name, 120);
  if ('phone' in input) data.phone = txt(input.phone, 40);
  if ('whatsapp' in input) data.whatsapp = txt(input.whatsapp, 40);

  if (input.email != null) {
    const next = String(input.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) return { error: 'Email inválido.' };
    if (next !== u.email) {
      const dup = await prisma.user.findUnique({ where: { email: next }, select: { id: true } });
      if (dup && dup.id !== userId) return { error: 'Ya existe un usuario con ese email.' };
      data.email = next;
    }
  }

  const newRole = input.role;
  const roleChange = !!newRole && newRole !== u.role;
  if (roleChange) {
    if (!['MECHANIC', 'STORE', 'DELIVERY'].includes(newRole)) return { error: 'Rol inválido.' };
    if ((await activeWorkCount(userId)) > 0) return { error: 'No se puede cambiar el rol: el usuario tiene órdenes o pedidos activos. Esperá a que se completen o cancelalos.' };
    data.role = newRole;
  }
  const role = newRole || u.role;

  // Si vino una dirección elegida del autocompletado, validar que esté en Bariloche.
  let coords = null;
  if ((role === 'MECHANIC' || role === 'STORE') && input.lat != null && input.lng != null) {
    const picked = { lat: Number(input.lat), lng: Number(input.lng), label: input.address };
    if (!inBariloche(picked)) return { error: 'Esa dirección no está en Bariloche. Elegí una del listado.' };
    coords = picked;
  }

  // perfil existente del rol destino (para mergear campos y validar coords requeridas en cambio de rol)
  let exMech = null, exStore = null, exDel = null;
  if (role === 'MECHANIC') { exMech = await prisma.mechanicProfile.findUnique({ where: { userId } }); if (roleChange && !coords && !(exMech && exMech.lat != null && exMech.lng != null)) return { error: 'Para mecánico hace falta una dirección: elegila del listado de sugerencias.' }; }
  if (role === 'STORE') { exStore = await prisma.storeProfile.findUnique({ where: { userId } }); if (roleChange && !coords && !(exStore && exStore.lat != null && exStore.lng != null)) return { error: 'Para comercio hace falta una dirección: elegila del listado de sugerencias.' }; }
  if (role === 'DELIVERY') { exDel = await prisma.deliveryProfile.findUnique({ where: { userId } }); }

  // ---- escritura ----
  try {
    await prisma.user.update({ where: { id: userId }, data });
    if (role === 'MECHANIC') {
      const up = { workshopName: input.name ?? exMech?.workshopName ?? null, barrio: input.barrio ?? exMech?.barrio ?? null, ...(coords ? { address: coords.label, lat: coords.lat, lng: coords.lng } : {}) };
      await prisma.mechanicProfile.upsert({ where: { userId }, update: up, create: { userId, ...up } });
    } else if (role === 'STORE') {
      // cuit es @unique: vacío DEBE ir como null (si no, dos comercios sin CUIT chocan con '' duplicado).
      const up = { tradeName: input.name || exStore?.tradeName || 'Comercio', cuit: input.cuit != null ? txt(input.cuit, 20) : (exStore?.cuit ?? null), ivaCondition: input.ivaCondition || exStore?.ivaCondition || null, barrio: input.barrio != null ? txt(input.barrio, 80) : (exStore?.barrio ?? null), ...(coords ? { address: coords.label, lat: coords.lat, lng: coords.lng } : {}) };
      await prisma.storeProfile.upsert({ where: { userId }, update: up, create: { userId, ...up } });
    } else if (role === 'DELIVERY') {
      const dni = input.dni ?? exDel?.dni; const licenseNumber = input.licenseNumber ?? exDel?.licenseNumber; const insurance = input.insurance ?? exDel?.insurance;
      const docsOk = !!(String(dni || '').trim() && String(licenseNumber || '').trim() && String(insurance || '').trim());
      const up = { vehicleType: input.vehicleType ?? exDel?.vehicleType ?? null, plate: input.plate ?? exDel?.plate ?? null, dni: dni || null, licenseNumber: licenseNumber || null, insurance: insurance || null, docsOk };
      await prisma.deliveryProfile.upsert({ where: { userId }, update: up, create: { userId, ...up } });
    }
    if (data.role) invalidateStatusCache(userId);
    return { ok: true };
  } catch (e) {
    return { error: e?.code === 'P2002' ? 'Datos duplicados (CUIT o email ya en uso).' : 'No se pudo guardar.' };
  }
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

// Autocompletado de direcciones de Bariloche para el alta (admin). Devuelve candidatos
// [{ label, lat, lng }] dentro del bounding box; el admin elige uno.
export async function searchAddresses(query) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return [];
  return searchBariloche(query);
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

// Control del mecánico: las compras que hizo en cuenta corriente (repuesto no cobrado por la
// plataforma, lo debe al comercio). Producto · fecha · comercio · monto · si el comercio ya lo procesó.
export async function getMyCreditPurchases() {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return [];
  const orders = await prisma.order.findMany({ where: { mechanicId: s.id, creditAccount: true, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } }, orderBy: { createdAt: 'desc' }, include: { request: { include: { category: true } } } });
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const stores = await prisma.storeProfile.findMany({ where: { userId: { in: storeIds } }, select: { userId: true, tradeName: true } });
  const nameOf = Object.fromEntries(stores.map((st) => [st.userId, st.tradeName]));
  return orders.map((o) => ({
    orderId: o.id, soldAt: o.createdAt?.getTime() || 0, part: num(o.partAmount),
    storeName: nameOf[o.storeId] || 'Comercio', settled: !!o.creditSettledAt,
    producto: o.request?.description || o.request?.category?.name || 'Repuesto',
    code: o.request?.code, brand: o.request?.brand, model: o.request?.model, year: o.request?.year,
  }));
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
  const items = (j.requests || []).map((r) => ({ ...reqBase(r), arrivedDrop: !!(r.order?.arrivedDropAt && r.order?.status === 'SHIPPED') }));
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
      await prisma.job.update({ where: { id: job.id }, data: { updatedAt: new Date() } }).catch(() => {});
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
  // mantener vivo el borrador (evita que el decaimiento de 24hs lo cancele mientras lo arma)
  await prisma.job.update({ where: { id: job.id }, data: { updatedAt: new Date() } }).catch(() => {});
  return { ok: true, jobId: job.id, itemId: res.id };
}

// "Eso es todo" -> publica el trabajo: arranca UNA ventana de 10 min para todos los ítems.
export async function publishJob(jobId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { requests: true } });
  if (!job || job.mechanicId !== s.id) return { error: 'No autorizado' };
  if (job.requests.length === 0) return { error: 'Agregá al menos un repuesto' };
  if (job.status !== 'DRAFT') return { error: 'Este trabajo ya fue publicado' };
  const ends = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.job.update({ where: { id: jobId }, data: { status: 'OPEN', windowEndsAt: ends } });
  await prisma.request.updateMany({ where: { jobId }, data: { windowEndsAt: ends, status: 'OPEN' } });
  // push a los comercios que venden esos rubros (o que reciben de todo)
  const catIds = [...new Set(job.requests.map((r) => r.categoryId).filter(Boolean))];
  const stores = await prisma.user.findMany({ where: { role: 'STORE', status: 'ACTIVE' }, select: { id: true, store: { select: { categories: { select: { categoryId: true } } } } } });
  const targets = stores.filter((u) => { const cats = u.store?.categories || []; return cats.length === 0 || catIds.length === 0 || cats.some((c) => catIds.includes(c.categoryId)); }).map((u) => u.id);
  await sendPushMany(targets, { title: 'Nuevo pedido para cotizar 🔧', body: 'Un taller necesita un repuesto. Cotizá antes de que cierre la ventana (10 min).', url: '/comercio', tag: 'nuevo-pedido-' + jobId }).catch(() => {});
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
  await sweepExpirations(); // cancela borradores viejos y trabajos sin pagar (24hs)
  const jobs = await prisma.job.findMany({ where: { mechanicId: s.id }, orderBy: { createdAt: 'desc' }, include: { requests: { include: { category: true, order: { select: { arrivedDropAt: true, status: true } } } } } });
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
// El desglose sale de jobChargePlan, el MISMO cálculo que usa la confirmación del pago:
// lo que se cobra en el link es exactamente lo que se registra al confirmar.
export async function createJobCheckout(jobId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const plan = await jobChargePlan(jobId);
  if (!plan || plan.job.mechanicId !== s.id) return { error: 'No autorizado' };
  const j = plan.job;
  if (['CANCELLED', 'PAID', 'DONE'].includes(j.status)) return { error: 'Este trabajo ya no admite pagos' };
  if (plan.items.length === 0) return { error: 'Elegí al menos una cotización' };

  const { parts, creditParts, commission, ship, mpFee, total } = plan.totals;
  const breakdown = { parts, creditParts, commission, ship, mpFee, total, stores: plan.stores, items: plan.items.length };
  // si el link ya fue generado, se REUTILIZA: dos links distintos = riesgo de cobro doble
  if (j.status === 'CLOSED' && j.paymentLink) return { link: j.paymentLink, breakdown };

  const amount = process.env.MP_TEST_AMOUNT ? Number(process.env.MP_TEST_AMOUNT) : total;
  const h = headers();
  const host = h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  // Dominio canónico para que MP vuelva a www.repuestosaltoque.com.ar (no al *.vercel.app).
  // APP_URL se setea por entorno en Vercel (prod = dominio real, staging = url de staging);
  // sin APP_URL (local) cae al host del request.
  const base = (process.env.APP_URL || `${proto}://${host}`).replace(/\/+$/, '');
  try {
    const { link } = await createPaymentLink({
      orderRef: `job::${jobId}`,
      title: `Repuestos · Trabajo #${j.code} · ${j.brand || ''} ${j.model || ''} ${j.plate || ''}`.trim(),
      amount,
      backUrl: `${base}/api/mp/return`,
      notificationUrl: `${base}/api/mp/webhook`,
    });
    await prisma.job.update({ where: { id: jobId }, data: { selectedAt: new Date(), status: 'CLOSED', paymentLink: link } });
    return { link, breakdown };
  } catch (e) {
    return { error: e?.message || 'No se pudo generar el link de pago.' };
  }
}

// ---- Repartidor: aviso de llegada e incidencias ----
export async function reportArrival(orderId, stage) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryId: true, storeId: true, mechanicId: true, status: true, ...TRIP_INCLUDE } });
  if (!o || o.deliveryId !== s.id) return { error: 'Este pedido no está asignado a vos' };
  // la llegada al COMERCIO es por comercio (recoge en cada uno); la llegada al TALLER es del viaje
  if (stage === 'pickup' && o.status === 'PAID') await prisma.order.updateMany({ where: { ...tripWhere(o, { perStore: true }), deliveryId: s.id, status: 'PAID' }, data: { arrivedPickupAt: new Date() } });
  else if (stage === 'drop' && o.status === 'SHIPPED') {
    await prisma.order.updateMany({ where: { ...tripWhere(o), deliveryId: s.id, status: 'SHIPPED' }, data: { arrivedDropAt: new Date() } });
    await sendPush(o.mechanicId, { title: 'El repartidor llegó a tu taller 📍', body: 'Recibí la pieza y dale tu PIN de entrega.', url: '/mecanico', tag: 'llegada-' + o.mechanicId }).catch(() => {});
  } else return { error: 'Etapa inválida' };
  return { ok: true };
}

export async function reportIssue(orderId, stage) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryId: true, storeId: true, mechanicId: true, ...TRIP_INCLUDE } });
  if (!o || o.deliveryId !== s.id) return { error: 'Este pedido no está asignado a vos' };
  // una incidencia en el RETIRO es de ese comercio; en la ENTREGA, del viaje
  const where = stage === 'drop' ? tripWhere(o) : tripWhere(o, { perStore: true });
  const text = stage === 'drop' ? 'Nadie me atendió en el taller' : 'Nadie me atendió en el comercio';
  await prisma.order.updateMany({ where: { ...where, deliveryId: s.id }, data: { issue: text, issueAt: new Date() } });
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
  // si no queda NINGÚN ítem vivo en el trabajo, el trabajo entero pasa a CANCELADO (no queda zombie activo)
  if (r.jobId) {
    const vivos = await prisma.request.count({ where: { jobId: r.jobId, status: { not: 'CANCELLED' } } });
    if (vivos === 0) await prisma.job.update({ where: { id: r.jobId }, data: { status: 'CANCELLED' } }).catch(() => {});
  }
  return { ok: true };
}
