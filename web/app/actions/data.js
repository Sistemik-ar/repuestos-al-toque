'use server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { createPaymentLink } from '@/lib/mercadopago';

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
    createdAt: r.createdAt?.getTime() || 0,
  };
}
// Para el mecánico: sin identidad del vendedor (anónimo)
function quotePublic(q) {
  return { id: q.id, alias: q.alias, partBrand: q.partBrand, price: num(q.price), warranty: q.warranty, note: q.note, photoUrls: q.photoUrls || [], rating: num(q.ratingSnapshot) || 4.8, zone: 'Centro', status: q.status };
}

export async function getMe() {
  const s = await getSession();
  return s ? { id: s.id, email: s.email, role: s.role, name: s.name } : null;
}

// ---- Mecánico ----
export async function createRequest(input) {
  const s = await getSession();
  if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  let categoryId = null;
  if (input.cat) { const c = await prisma.category.findUnique({ where: { slug: input.cat } }); categoryId = c?.id ?? null; }
  const code = String(1042 + (await prisma.request.count()));
  const r = await prisma.request.create({
    data: {
      code, mechanicId: s.id,
      brand: input.brand || null, model: input.model || null, year: input.year ? parseInt(input.year, 10) : null, vin: input.vin || null,
      categoryId, description: input.desc || null,
      urgency: URGENCY[input.urgency] || 'AHORA',
      photoUrls: input.photoUrls || [],
      invoiceType: input.invoiceType === 'factura_a' ? 'FACTURA_A' : 'CONSUMIDOR_FINAL',
      invEmisorName: input.emisorRazon || null, invEmisorCuit: input.emisorCuit || null,
      invBuyerName: input.solicRazon || null, invBuyerCuit: input.solicCuit || null,
      status: 'OPEN', windowEndsAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  return { id: r.id, code: r.code };
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
  return { ...reqBase(r), quotes: r.quotes.map(quotePublic) };
}

export async function acceptQuote(quoteId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.request.mechanicId !== s.id) return { error: 'No autorizado' };
  await prisma.requestQuote.update({ where: { id: quoteId }, data: { status: 'SELECTED' } });
  await prisma.request.update({ where: { id: q.requestId }, data: { status: 'CLOSED' } });
  return { ok: true, requestId: q.requestId, quoteId };
}

export async function markRequestPaid(requestId, quoteId) {
  const s = await getSession(); if (!s) return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId } });
  if (!q) return { error: 'Cotización no encontrada' };
  const part = num(q.price) || 0; const commission = Math.round(part * 0.05); const ship = 3500; const total = part + commission + ship;
  await prisma.order.upsert({
    where: { requestId },
    update: { quoteId, storeId: q.storeId, partAmount: part, commissionAmount: commission, freightAmount: ship, total, status: 'PAID' },
    create: { requestId, quoteId, mechanicId: s.id, storeId: q.storeId, partAmount: part, commissionAmount: commission, freightAmount: ship, total, status: 'PAID' },
  });
  await prisma.request.update({ where: { id: requestId }, data: { status: 'PAID' } });
  return { ok: true };
}

// ---- Mercado Pago: crea el link de pago (cobro centralizado a la cuenta de Jorge) ----
export async function createMpCheckout(requestId, quoteId) {
  const s = await getSession(); if (!s || s.role !== 'MECHANIC') return { error: 'No autorizado' };
  const q = await prisma.requestQuote.findUnique({ where: { id: quoteId }, include: { request: true } });
  if (!q || q.request.mechanicId !== s.id) return { error: 'No autorizado' };

  const part = num(q.price) || 0;
  const total = part + Math.round(part * 0.05) + 3500; // repuesto + comisión 5% + envío

  const h = headers();
  const host = h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  const appUrl = `${proto}://${host}`;

  try {
    const { link } = await createPaymentLink({
      orderRef: `${requestId}::${quoteId}`,
      title: `Repuesto · pedido #${q.request.code}`,
      amount: total,
      backUrl: `${appUrl}/api/mp/return`,
      notificationUrl: `${appUrl}/api/mp/webhook`,
    });
    return { link };
  } catch (e) {
    return { error: e?.message || 'No se pudo generar el link de pago.' };
  }
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
