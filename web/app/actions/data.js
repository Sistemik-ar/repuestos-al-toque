'use server';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { createPaymentLink } from '@/lib/mercadopago';
import { computeShip, computePricing } from '@/lib/orders';
import { getSettings as readSettings } from '@/lib/settings';
import { geocode } from '@/lib/geo';

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
    createdAt: r.createdAt?.getTime() || 0,
  };
}
// Para el mecánico: sin identidad del vendedor (anónimo)
function quotePublic(q, creditEligible = false) {
  return { id: q.id, alias: q.alias, partBrand: q.partBrand, price: num(q.price), warranty: q.warranty, note: q.note, photoUrls: q.photoUrls || [], rating: num(q.ratingSnapshot) || 4.8, zone: 'Centro', status: q.status, creditEligible };
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
  let categoryId = null;
  if (input.cat) { const c = await prisma.category.findUnique({ where: { slug: input.cat } }); categoryId = c?.id ?? null; }
  const data = {
    mechanicId: s.id,
    brand: input.brand || null, model: input.model || null, year: input.year ? parseInt(input.year, 10) : null, vin: input.vin || null,
    categoryId, description: input.desc || null,
    urgency: URGENCY[input.urgency] || 'AHORA',
    photoUrls: input.photoUrls || [],
    invoiceType: input.invoiceType === 'factura_a' ? 'FACTURA_A' : 'CONSUMIDOR_FINAL',
    invEmisorName: input.emisorRazon || null, invEmisorCuit: input.emisorCuit || null,
    invBuyerName: input.solicRazon || null, invBuyerCuit: input.solicCuit || null,
    status: 'OPEN', windowEndsAt: new Date(Date.now() + 10 * 60 * 1000),
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

export async function acceptQuote(quoteId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.request.mechanicId !== s.id) return { error: 'No autorizado' };
  await prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } });
  await prisma.request.update({ where: { id: q.requestId }, data: { status: 'CLOSED' } });
  return { ok: true, requestId: q.requestId, quoteId };
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
  const r = await prisma.request.findUnique({ where: { id: requestId }, select: { mechanicId: true } });
  if (!r || r.mechanicId !== s.id) return { error: 'No autorizado' };
  await prisma.request.update({ where: { id: requestId }, data: { status: 'OPEN', windowEndsAt: new Date(Date.now() + 10 * 60 * 1000) } });
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
  const creditAccount = !!opts.creditAccount;
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
  return computePricing(part, ship, await readSettings(), !!opts.creditAccount);
}

// ---- Comercio (vendedor) ----
export async function getOpenRequestsForStore() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return [];
  const rows = await prisma.request.findMany({
    where: { status: { in: ['OPEN', 'QUOTED'] } },
    orderBy: { createdAt: 'desc' },
    include: { category: true, quotes: { where: { storeId: s.id }, select: { id: true, price: true } } },
  });
  // sin identidad del mecánico
  return rows.map((r) => ({ ...reqBase(r), mineQuoted: r.quotes.length > 0, myPrice: r.quotes[0] ? num(r.quotes[0].price) : null }));
}

export async function getStoreSales() {
  const s = await getSession(); if (!s || s.role !== 'STORE') return [];
  const orders = await prisma.order.findMany({ where: { storeId: s.id, status: 'PAID' }, orderBy: { createdAt: 'desc' }, include: { request: { include: { category: true } } } });
  return orders.map((o) => ({ orderId: o.id, total: num(o.total), part: num(o.partAmount), ...reqBase(o.request) }));
}

export async function createQuote(requestId, input) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { status: true } });
  if (!req) return { error: 'Solicitud no encontrada' };
  if (!['OPEN', 'QUOTED'].includes(req.status)) return { error: 'La solicitud ya no admite cotizaciones' };
  const dup = await prisma.requestQuote.findFirst({ where: { requestId, storeId: s.id } });
  if (dup) return { error: 'Ya cotizaste esta solicitud' };
  const store = await prisma.storeProfile.findUnique({ where: { userId: s.id } });
  await prisma.requestQuote.create({
    data: {
      requestId, storeId: s.id, alias: aliasFor(s.name || store?.tradeName),
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
  const orders = await prisma.order.findMany({ where: { status: { in: ['PAID', 'SHIPPED'] } }, orderBy: { createdAt: 'desc' }, include: { request: { include: { category: true } } } });
  return orders.map((o) => ({ orderId: o.id, status: o.status, ...reqBase(o.request) }));
}
export async function markDelivered(orderId) {
  const s = await getSession(); if (!s || s.role !== 'DELIVERY') return { error: 'No autorizado' };
  await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED' } });
  return { ok: true };
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

  let coords = null;
  if ((role === 'MECHANIC' || role === 'STORE') && input.address) {
    coords = await geocode(`${input.address} ${input.barrio || ''}`.trim());
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
      await prisma.deliveryProfile.create({ data: { userId: user.id, vehicleType: input.vehicleType || null } });
    }
    return { ok: true, tempPassword, geocoded: !!coords };
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
  ];
  for (const [key, value] of entries) await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  return { ok: true };
}

export async function geocodeAddress(address) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return null;
  return geocode(address);
}

// ================= Cuenta Corriente =================
function estadoCC(c) {
  if (c.disabledAt) return 'DISABLED';
  if (c.adminStatus === 'REJECTED' || c.storeStatus === 'REJECTED') return 'REJECTED';
  if (c.active) return 'ACTIVE';
  return 'PENDING';
}

// --- Mecánico ---
export async function getMyCreditAccounts() {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return [];
  const ccs = await prisma.creditAccount.findMany({ where: { mechanicId: s.id }, orderBy: { createdAt: 'desc' } });
  const stores = await prisma.storeProfile.findMany({ where: { userId: { in: ccs.map((c) => c.storeId) } }, select: { userId: true, tradeName: true } });
  const nameOf = Object.fromEntries(stores.map((st) => [st.userId, st.tradeName]));
  return ccs.map((c) => ({ id: c.id, storeName: nameOf[c.storeId] || 'Comercio', status: estadoCC(c) }));
}

// Comercios disponibles para solicitar CC + estado actual con este mecánico.
export async function getStoresForCredit() {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return [];
  const stores = await prisma.storeProfile.findMany({ select: { userId: true, tradeName: true, barrio: true } });
  const ccs = await prisma.creditAccount.findMany({ where: { mechanicId: s.id } });
  const byStore = Object.fromEntries(ccs.map((c) => [c.storeId, c]));
  return stores.map((st) => ({ storeId: st.userId, name: st.tradeName, barrio: st.barrio, status: byStore[st.userId] ? estadoCC(byStore[st.userId]) : 'NONE' }));
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
  return ccs.map((c) => ({ id: c.id, mechanicName: nameOf[c.mechanicId] || 'Taller', storeStatus: c.storeStatus, status: estadoCC(c) }));
}

export async function storeActOnCredit(id, approve) {
  const s = await getSession(); if (!s || s.role !== 'STORE') return { error: 'No autorizado' };
  const cc = await prisma.creditAccount.findUnique({ where: { id } });
  if (!cc || cc.storeId !== s.id) return { error: 'No autorizado' };
  const storeStatus = approve ? 'APPROVED' : 'REJECTED';
  const active = storeStatus === 'APPROVED' && cc.adminStatus === 'APPROVED' && !cc.disabledAt;
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
  return ccs.map((c) => ({ id: c.id, mechanicName: mName[c.mechanicId] || 'Taller', storeName: sName[c.storeId] || 'Comercio', adminStatus: c.adminStatus, storeStatus: c.storeStatus, adminNote: c.adminNote, status: estadoCC(c) }));
}

export async function adminActOnCredit(id, approve, note) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  const cc = await prisma.creditAccount.findUnique({ where: { id } });
  if (!cc) return { error: 'No encontrado' };
  const adminStatus = approve ? 'APPROVED' : 'REJECTED';
  const active = adminStatus === 'APPROVED' && cc.storeStatus === 'APPROVED' && !cc.disabledAt;
  await prisma.creditAccount.update({ where: { id }, data: { adminStatus, adminNote: note || null, adminActedAt: new Date(), active } });
  return { ok: true };
}

export async function disableCreditAccount(id) {
  const s = await getSession(); if (!s || s.role !== 'ADMIN') return { error: 'No autorizado' };
  await prisma.creditAccount.update({ where: { id }, data: { active: false, disabledAt: new Date() } });
  return { ok: true };
}
