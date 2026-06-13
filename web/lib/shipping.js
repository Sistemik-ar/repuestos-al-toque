// Cálculo del costo de envío por distancia (Bariloche): tabla de bandas por km
// (editable en el backoffice) con un mínimo configurable.

export const MIN_SHIP = 5000; // costo de envío mínimo

// Costo según la tabla de bandas del backoffice (rows: [{uptoKm, price}]).
// `min` viene de la config del negocio (default $5000). Sin distancia o sin tabla -> mínimo.
export function shippingCostFromTariff(km, rows, min = MIN_SHIP) {
  if (km == null || !rows || rows.length === 0) return min;
  const sorted = [...rows].sort((a, b) => a.uptoKm - b.uptoKm);
  const band = sorted.find((r) => km <= r.uptoKm) || sorted[sorted.length - 1];
  return Math.max(min, Math.round(Number(band.price)));
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
