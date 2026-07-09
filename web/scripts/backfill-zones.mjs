// Backfill de zoneId para perfiles existentes (mecánicos y comercios cargados antes de que
// existiera la tabla zones): asigna la zona cuyo bounding box contiene sus coordenadas.
// Correr UNA vez después de `prisma db push` + `db:seed` (necesita las zonas sembradas):
//   node scripts/backfill-zones.mjs           (usa DATABASE_URL del entorno)
// Idempotente: solo toca perfiles con zoneId null y coords cargadas.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const inZone = (c, z) => c.lat >= z.latMin && c.lat <= z.latMax && c.lng >= z.lngMin && c.lng <= z.lngMax;

async function backfill(table, label) {
  const zones = await prisma.zone.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
  if (!zones.length) { console.error('✋ No hay zonas cargadas: corré primero npm run db:seed'); process.exit(1); }
  const rows = await table.findMany({ where: { zoneId: null, lat: { not: null }, lng: { not: null } }, select: { userId: true, lat: true, lng: true, address: true } });
  let ok = 0;
  const sinZona = [];
  for (const r of rows) {
    const z = zones.find((zz) => inZone({ lat: Number(r.lat), lng: Number(r.lng) }, zz));
    if (!z) { sinZona.push(r); continue; }
    await table.update({ where: { userId: r.userId }, data: { zoneId: z.id } });
    ok++;
  }
  console.log(`• ${label}: ${ok} asignados, ${sinZona.length} sin zona de ${rows.length} pendientes.`);
  for (const r of sinZona) console.log(`   ⚠ fuera de toda zona: ${r.userId} (${r.lat}, ${r.lng}) ${r.address || ''}`);
}

await backfill(prisma.mechanicProfile, 'Mecánicos');
await backfill(prisma.storeProfile, 'Comercios');
await prisma.$disconnect();
console.log('✅ Backfill de zonas OK');
