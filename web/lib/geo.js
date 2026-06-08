// Geocodificación gratuita con Nominatim (OpenStreetMap). Server-only.
// Convierte una dirección en coordenadas (lat/lng) para calcular distancias.
export async function geocode(address) {
  if (!address) return null;
  const q = encodeURIComponent(address.includes('Bariloche') ? address : `${address}, Bariloche, Río Negro, Argentina`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${q}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'RepuestosAlToque/1.0 (contacto@repuestosaltoque.com.ar)' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}
