// Seed SOLO de zonas de cobertura — seguro para producción (no toca usuarios ni contraseñas,
// a diferencia de seed.mjs). Solo el ÁREA se re-upserta; los interruptores (activa / delivery /
// comercios) NO se pisan si la zona ya existe: se manejan desde el backoffice.
// Uso: npm run db:seed-zones  (con DATABASE_URL apuntando a la base que corresponda)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const zones = [
  // Bariloche: mismo box que estaba hardcodeado (centro, km de Bustillo, Dina Huapi)
  { slug: 'bariloche', name: 'Bariloche', latMin: -41.30, latMax: -40.95, lngMin: -71.70, lngMax: -71.05, active: true, deliveryEnabled: true, storesEnabled: true },
  // El Bolsón (+ Mallín Ahogado / Villa Turismo): solo mecánicos; la entrega se coordina internamente
  { slug: 'el-bolson', name: 'El Bolsón', latMin: -42.05, latMax: -41.85, lngMin: -71.65, lngMax: -71.40, active: true, deliveryEnabled: false, storesEnabled: false },
];

for (const z of zones) {
  const { slug, name, latMin, latMax, lngMin, lngMax } = z;
  await prisma.zone.upsert({ where: { slug }, update: { name, latMin, latMax, lngMin, lngMax }, create: z });
  console.log(`• Zona lista: ${name} (${slug})`);
}
await prisma.$disconnect();
console.log('✅ Seed de zonas OK');
