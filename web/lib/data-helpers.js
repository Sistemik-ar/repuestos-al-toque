// Helpers PUROS de data.js (sin estado, sin 'use server'): mapeos de urgencia, saneo de texto,
// y las "shapes" públicas (reqBase/quotePublic/jobBase) + utilidades de viaje/patente.
// Separados de las server actions para que el archivo de acciones sea legible.

export const URGENCY = { 'Necesito ahora': 'AHORA', Hoy: 'HOY', 'Mañana': 'MANANA' };

export const URGENCY_LABEL = { AHORA: 'Necesito ahora', HOY: 'Hoy', MANANA: 'Mañana' };

export const txt = (v, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null; };

export const num = (d) => (d == null ? null : Number(d));

export function reqBase(r) {
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

export function quotePublic(q, creditEligible = false) {
  return { id: q.id, alias: q.alias, optionLabel: q.optionLabel, partBrand: q.partBrand, price: num(q.price), warranty: q.warranty, note: q.note, photoUrls: q.photoUrls || [], rating: q.ratingSnapshot == null ? null : num(q.ratingSnapshot), status: q.status, creditEligible };
}

export const newPin = () => String(Math.floor(1000 + Math.random() * 9000)); // 4 dígitos

export function tripWhere(o, { perStore = false } = {}) {
  const plate = o.request?.job?.plate;
  if (plate && o.deliveryId) {
    const w = { deliveryId: o.deliveryId, mechanicId: o.mechanicId, request: { job: { plate } } };
    if (perStore) w.storeId = o.storeId; // acota a los ítems de ESE comercio (retiro por comercio)
    return w;
  }
  return { id: o.id };
}

export const TRIP_INCLUDE = { request: { select: { jobId: true, job: { select: { plate: true } } } } };

export const PLATE_RE = /^([A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})$/i; // ABC123 / AB123CD

export const normPlate = (p) => String(p || '').toUpperCase().replace(/\s+/g, '');

export function jobBase(j) {
  const items = (j.requests || []).map((r) => ({ ...reqBase(r), arrivedDrop: !!(r.order?.arrivedDropAt && r.order?.status === 'SHIPPED') }));
  return {
    id: j.id, code: j.code, brand: j.brand, model: j.model, year: j.year, plate: j.plate, vin: j.vin,
    status: j.status, windowEndsAt: j.windowEndsAt ? j.windowEndsAt.getTime() : null,
    createdAt: j.createdAt?.getTime() || 0, items,
  };
}
