'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

// Centro de San Carlos de Bariloche (fallback cuando todavía no hay coords elegidas).
const BRC = { lat: -41.1335, lng: -71.3103 };

// Mini-mapa con pin arrastrable para fijar la ubicación EXACTA del envío.
// Nominatim/OSM muchas veces no tiene la altura en Bariloche y cae al centro de la calle:
// arrastrando el pin (o tocando el mapa) el admin corrige el punto y guardamos coords precisas.
export default function LocationPicker({ lat, lng, onChange }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const selfRef = useRef(false); // el último cambio vino de arrastrar/tocar (no recentrar)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const has = lat != null && lng != null;
      const c = has ? { lat, lng } : BRC;
      const map = L.map(elRef.current, { scrollWheelZoom: false }).setView([c.lat, c.lng], has ? 17 : 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      const icon = L.divIcon({ className: 'rat-pin', html: '<i class="fa-solid fa-location-dot"></i>', iconSize: [34, 34], iconAnchor: [17, 32] });
      const marker = L.marker([c.lat, c.lng], { draggable: true, icon }).addTo(map);
      const push = (ll) => { selfRef.current = true; onChangeRef.current?.(ll.lat, ll.lng); };
      marker.on('dragend', () => push(marker.getLatLng()));
      map.on('click', (e) => { marker.setLatLng(e.latlng); push(e.latlng); });
      mapRef.current = map; markerRef.current = marker;
      setTimeout(() => map.invalidateSize(), 0); // recalcula tamaño si el contenedor recién apareció
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // coords cambiadas desde afuera (eligieron otra sugerencia) -> recentrar; no si vino del arrastre
  useEffect(() => {
    if (selfRef.current) { selfRef.current = false; return; }
    if (!mapRef.current || !markerRef.current || lat == null || lng == null) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], 17);
  }, [lat, lng]);

  return (
    <div style={{ marginTop: 8 }}>
      <div ref={elRef} className="rat-map" style={{ height: 220 }} />
      <div className="text-xs muted mt-4"><i className="fa-solid fa-hand-pointer"></i> Arrastrá el pin (o tocá el mapa) para fijar la ubicación exacta — la búsqueda no siempre tiene la altura.</div>
    </div>
  );
}
