// Geocodificación gratuita con Nominatim (OpenStreetMap) + distancia de manejo con OSRM. Server-only.
// Las zonas de cobertura (bounding boxes) viven en la DB (ver lib/zones.js); acá solo hay
// funciones puras que reciben zonas como parámetro.

const UA = { 'User-Agent': 'RepuestosAlToque/1.0 (contacto@repuestosaltoque.com.ar)' };

// ¿El punto cae dentro del bounding box de la zona?
export function inZone(c, z) {
  return !!c && !!z && c.lat >= z.latMin && c.lat <= z.latMax && c.lng >= z.lngMin && c.lng <= z.lngMax;
}

// Primera zona (en orden) que contiene el punto, o null si no cae en ninguna.
export function zoneOf(c, zones) {
  return (zones || []).find((z) => inZone(c, z)) || null;
}

// Autocompletado de direcciones RESTRINGIDO a las zonas habilitadas (para el alta): una consulta
// Nominatim acotada por zona (bounded=1 + viewbox; el viewbox es uno solo por consulta, y un box
// gigante Bariloche+Bolsón metería todo el medio). Devuelve candidatos [{ label, lat, lng, zone }]
// ya filtrados dentro de su box. El admin elige uno -> guardamos sus coords exactas (sin re-geocodificar).
export async function searchInZones(query, zones) {
  const q = String(query || '').trim();
  if (q.length < 3 || !zones?.length) return [];
  const perZone = await Promise.all(zones.map(async (z) => {
    const viewbox = `${z.lngMin},${z.latMax},${z.lngMax},${z.latMin}`; // left,top,right,bottom
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=6&countrycodes=ar&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(q)}`;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { headers: UA, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return [];
      const data = await res.json();
      return (Array.isArray(data) ? data : [])
        .map((d) => ({ label: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon), zone: z.slug }))
        .filter((c) => inZone(c, z)); // doble seguro: nunca devolver algo fuera del box
    } catch {
      return [];
    }
  }));
  // sin duplicados entre zonas (por si los boxes se solaparan) y con tope total
  const seen = new Set();
  return perZone.flat().filter((c) => {
    const k = `${c.lat},${c.lng}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
}

// Convierte una dirección en coordenadas. Devuelve { lat, lng, label } o null si no se encontró.
// Timeout corto: si Nominatim se cuelga, el alta de usuarios no puede quedar trabada esperando.
export async function geocode(address, cityHint = 'Bariloche, Río Negro, Argentina') {
  if (!address) return null;
  const q = encodeURIComponent(/bariloche|bols[oó]n/i.test(address) ? address : `${address}, ${cityHint}`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${q}`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { headers: UA, signal: ctrl.signal });
    clearTimeout(t);
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
