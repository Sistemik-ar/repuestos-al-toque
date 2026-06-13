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

// Categorías del MVP (nombres definitivos, orden alfabético). slug estable; nombre/ícono por upsert.
const categories = [
  ['accesorios', 'Accesorios y equipamiento', 'fa-toolbox'],
  ['carroceria', 'Carrocería', 'fa-car-side'],
  ['electricidad', 'Electricidad y electrónica', 'fa-bolt'],
  ['embrague', 'Embrague y transmisión', 'fa-gears'],
  ['frenos', 'Frenos', 'fa-record-vinyl'],
  ['inyeccion', 'Inyección y combustible', 'fa-gas-pump'],
  ['lubricacion', 'Lubricentro', 'fa-oil-can'],
  ['motor', 'Motor', 'fa-gear'],
  ['refrigeracion', 'Refrigeración A/C Calefa', 'fa-snowflake'],
  ['suspension', 'Suspensión y dirección', 'fa-car-burst'],
];
// "otros" se discontinuó: si quedó de un seed viejo y no tiene pedidos asociados, se elimina.

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
    // docsOk: true -> repartidor habilitado para tomar pedidos (si no, claimDelivery lo bloquea)
    if (a.role === 'DELIVERY') await prisma.deliveryProfile.upsert({ where: { userId: user.id }, update: { docsOk: true }, create: { userId: user.id, vehicleType: 'MOTO', docsOk: true } });
  }

  for (const [slug, name, icon] of categories) {
    await prisma.category.upsert({ where: { slug }, update: { name, icon }, create: { slug, name, icon } });
  }
  // baja de "otros" (discontinuada): solo si no quedó ningún pedido en esa categoría
  const otros = await prisma.category.findUnique({ where: { slug: 'otros' } });
  if (otros) {
    const used = await prisma.request.count({ where: { categoryId: otros.id } });
    if (used === 0) { await prisma.storeCategory.deleteMany({ where: { categoryId: otros.id } }); await prisma.category.delete({ where: { id: otros.id } }); }
  }

  console.log('✅ Seed OK');
  console.log('Cuentas (password: ' + TEST_PASSWORD + '):');
  accounts.forEach((a) => console.log('  -', a.role.padEnd(9), a.email));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
