// Zonas de cobertura (server-only): dónde se dan de alta usuarios y si ahí opera la flota
// de repartidores. Editables desde el backoffice (tabla zones). Ver lib/geo.js para los
// helpers puros de bounding box.
import { prisma } from '@/lib/db';
import { zoneOf } from '@/lib/geo';

// Fallback si la tabla todavía está vacía (mismo box que estaba hardcodeado en geo.js):
// San Carlos de Bariloche y alrededores (centro, km de Bustillo, Dina Huapi).
export const DEFAULT_ZONES = [
  { id: null, slug: 'bariloche', name: 'Bariloche', latMin: -41.30, latMax: -40.95, lngMin: -71.70, lngMax: -71.05, active: true, deliveryEnabled: true, storesEnabled: true },
];

export async function getActiveZones() {
  try {
    const rows = await prisma.zone.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
    return rows.length ? rows : DEFAULT_ZONES;
  } catch {
    return DEFAULT_ZONES;
  }
}

// Zonas donde se puede dar de alta cada rol: mecánicos en cualquier zona activa;
// comercios solo donde storesEnabled (hoy: Bariloche).
export function zonesForRole(zones, role) {
  return role === 'STORE' ? zones.filter((z) => z.storesEnabled) : zones;
}

// Zona del mecánico: la guardada en su perfil o, si es un alta vieja sin zoneId (pre-backfill),
// derivada de sus coordenadas contra las zonas activas. null si no se puede determinar.
export async function mechanicZone(mechanicId) {
  try {
    const prof = await prisma.mechanicProfile.findUnique({
      where: { userId: mechanicId },
      select: { zoneId: true, lat: true, lng: true, zone: true },
    });
    if (!prof) return null;
    if (prof.zone) return prof.zone;
    if (prof.lat == null || prof.lng == null) return null;
    return zoneOf({ lat: Number(prof.lat), lng: Number(prof.lng) }, await getActiveZones());
  } catch {
    return null;
  }
}
