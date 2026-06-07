// Seed de cuentas de prueba + categorías base.
// Corre con `npm run db:seed` una vez configurada DATABASE_URL.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'repuestos123'; // contraseña de prueba (cambiar en producción real)

const accounts = [
  { email: 'admin@repuestosaltoque.com.ar',      role: 'ADMIN',    name: 'Administración' },
  { email: 'mecanico@repuestosaltoque.com.ar',   role: 'MECHANIC', name: 'Taller Patagonia' },
  { email: 'vendedor@repuestosaltoque.com.ar',   role: 'STORE',    name: 'Repuestos Centro' },
  { email: 'repartidor@repuestosaltoque.com.ar', role: 'DELIVERY', name: 'Diego R.' },
];

const categories = [
  ['frenos', 'Frenos', 'fa-record-vinyl'], ['motor', 'Motor', 'fa-gear'],
  ['electricidad', 'Electricidad', 'fa-bolt'], ['suspension', 'Suspensión', 'fa-car-burst'],
  ['embrague', 'Embrague', 'fa-gears'], ['refrigeracion', 'Refrigeración', 'fa-snowflake'],
  ['lubricacion', 'Lubricación', 'fa-oil-can'], ['carroceria', 'Carrocería', 'fa-car-side'],
  ['otros', 'Otros', 'fa-ellipsis'],
];

async function main() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  for (const a of accounts) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { role: a.role, name: a.name, status: 'ACTIVE', passwordHash },
      create: { email: a.email, role: a.role, name: a.name, status: 'ACTIVE', passwordHash },
    });
    if (a.role === 'MECHANIC') await prisma.mechanicProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, workshopName: a.name, barrio: 'Centro' } });
    if (a.role === 'STORE') await prisma.storeProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, tradeName: a.name, barrio: 'Centro', ivaCondition: 'RESPONSABLE_INSCRIPTO' } });
    if (a.role === 'DELIVERY') await prisma.deliveryProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, vehicleType: 'MOTO' } });
  }

  for (const [slug, name, icon] of categories) {
    await prisma.category.upsert({ where: { slug }, update: { name, icon }, create: { slug, name, icon } });
  }

  console.log('✅ Seed OK');
  console.log('Cuentas (password: ' + TEST_PASSWORD + '):');
  accounts.forEach((a) => console.log('  -', a.role.padEnd(9), a.email));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
