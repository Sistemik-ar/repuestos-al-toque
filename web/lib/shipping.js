// Cálculo del costo de envío por distancia (Bariloche).
// Distancia: haversine entre coordenadas (lat/lng) * factor de ruta (la calle no es recta).
// Tarifa: bajada de bandera (base) + por km, con mínimo y recargo por tamaño de paquete.
//
// Los valores son PLACEHOLDER: deben reemplazarse por la tarifa real de la empresa de fletes.
// Para distancia "de manejo" exacta se puede cambiar haversine por Google Distance Matrix.

export const TARIFF = {
  base: 1500,        // bajada de bandera
  perKm: 700,        // por km
  min: 2000,         // mínimo
  roadFactor: 1.3,   // la distancia por calle es ~30% más que la línea recta
  sizeFactor: { moto: 1, auto: 1.4, utilitario: 1.8 },
};

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// from/to: {lat,lng}. O pasar km directo. size: moto|auto|utilitario.
export function shippingCost({ from, to, km, size = 'moto', tariff = TARIFF }) {
  let dist = km;
  if (dist == null && from && to) dist = haversineKm(from, to) * tariff.roadFactor;
  dist = dist || 0;
  const factor = tariff.sizeFactor[size] || 1;
  const cost = Math.round((tariff.base + tariff.perKm * dist) * factor);
  return { km: Math.round(dist * 10) / 10, cost: Math.max(cost, tariff.min) };
}
