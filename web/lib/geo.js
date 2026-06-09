// Geocodificación gratuita con Nominatim (OpenStreetMap) + distancia de manejo con OSRM. Server-only.

const UA = { 'User-Agent': 'RepuestosAlToque/1.0 (contacto@repuestosaltoque.com.ar)' };

// Bounding box de San Carlos de Bariloche y alrededores (centro, km de Bustillo, Dina Huapi).
const BARILOCHE_BBOX = { latMin: -41.30, latMax: -40.95, lngMin: -71.70, lngMax: -71.05 };

export function inBariloche(c) {
  return !!c && c.lat >= BARILOCHE_BBOX.latMin && c.lat <= BARILOCHE_BBOX.latMax && c.lng >= BARILOCHE_BBOX.lngMin && c.lng <= BARILOCHE_BBOX.lngMax;
}

// Convierte una dirección en coordenadas. Devuelve { lat, lng, label } o null si no se encontró.
export async function geocode(address) {
  if (!address) return null;
  const q = encodeURIComponent(address.includes('Bariloche') ? address : `${address}, Bariloche, Río Negro, Argentina`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${q}`;
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
  } catch {
    return null;
  }
}

// Distancia de MANEJO real entre dos puntos (OSRM público, gratis). Devuelve km o null si falla.
// Quien la use debe tener fallback (haversine) porque es un servicio best-effort.
export async function drivingKm(from, to) {
  if (!from?.lat || !to?.lat) return null;
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const m = data?.routes?.[0]?.distance;
    return m ? m / 1000 : null;
  } catch {
    return null;
  }
}
