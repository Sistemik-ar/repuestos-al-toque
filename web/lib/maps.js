// Link de navegación de Google Maps ("cómo llegar") a un punto de retiro/entrega.
// Prioriza las coordenadas exactas (alta validada por mapa); si no hay, usa el texto
// de la dirección. Modo "dir" = abre la navegación desde la ubicación actual.
export function mapsDirUrl(p) {
  if (!p) return null;
  if (p.lat != null && p.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
  }
  if (p.address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.address} ${p.barrio || ''} Bariloche`.trim())}`;
  }
  return null;
}
