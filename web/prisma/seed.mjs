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

// Pedidos de DEMO (opt-in: SEED_DEMO=1) para ver en el admin/staging ejemplos de cada estado/vista:
// abierto, cotizado (con tiempos de respuesta, sin stock y "no respondieron"), elegido sin pagar,
// pagado, en camino, entregado (con reparto + reseña) y cancelado. NO corre en E2E ni en prod.
async function seedDemoPedidos() {
  if (await prisma.request.findFirst({ where: { code: { startsWith: 'DEMO' } }, select: { id: true } })) {
    console.log('• Demo de pedidos: ya existe, se omite.'); return;
  }
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const mech = await prisma.user.findUnique({ where: { email: 'mecanico@repuestosaltoque.com.ar' }, select: { id: true } });
  const vendor = await prisma.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' }, select: { id: true } });
  const rider = await prisma.user.findUnique({ where: { email: 'repartidor@repuestosaltoque.com.ar' }, select: { id: true } });
  if (!mech || !vendor) { console.log('• Demo de pedidos: faltan cuentas base.'); return; }
  const stores = [vendor.id];
  for (const [email, name] of [['andina@demo.rat', 'Andina Parts'], ['sur@demo.rat', 'Sur Repuestos'], ['frenosdelsur@demo.rat', 'Frenos del Sur']]) {
    const u = await prisma.user.upsert({ where: { email }, update: { role: 'STORE', name, status: 'ACTIVE', passwordHash }, create: { email, role: 'STORE', name, status: 'ACTIVE', passwordHash } });
    await prisma.storeProfile.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id, tradeName: name, barrio: 'Centro', ivaCondition: 'RESPONSABLE_INSCRIPTO' } });
    stores.push(u.id);
  }
  const cat = Object.fromEntries((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const ago = (min) => new Date(Date.now() - min * 60000);
  let i = 0;
  const mkJob = (plate, brand, model, status) => prisma.job.create({ data: { code: `DEMOJ${++i}`, mechanicId: mech.id, plate, brand, model, status } });
  const mkReq = (j, desc, slug, status, extra = {}) => prisma.request.create({ data: { code: `DEMOR${i}`, mechanicId: mech.id, jobId: j.id, description: desc, brand: j.brand, model: j.model, categoryId: cat[slug] || null, status, photoUrls: [], ...extra } });
  const mkQuote = (r, storeId, price, status, createdAt) => prisma.requestQuote.create({ data: { requestId: r.id, storeId, alias: 'Casa', price, status, partBrand: 'OEM', optionLabel: 'Original / OEM', photoUrls: [], createdAt } });

  // 1) ABIERTO (sin cotizaciones todavía)
  { const j = await mkJob('AB100AA', 'Fiat', 'Cronos', 'DRAFT'); await mkReq(j, 'Pastillas de freno del.', 'frenos', 'OPEN', { createdAt: ago(25) }); }
  // 2) COTIZADO: 2 cotizaciones a distinto tiempo + 1 "sin stock" + 1 que no respondió
  { const j = await mkJob('AB200BB', 'VW', 'Amarok', 'PAID'); const r = await mkReq(j, 'Kit de embrague', 'embrague', 'QUOTED', { createdAt: ago(180) });
    await mkQuote(r, stores[0], 184000, 'SENT', ago(150)); await mkQuote(r, stores[1], 192000, 'SENT', ago(90));
    await prisma.requestDismissal.create({ data: { storeId: stores[2], requestId: r.id, createdAt: ago(120) } }); /* stores[3] no responde */ }
  // 3) ELEGIDO SIN PAGAR (CLOSED + cotización elegida, sin orden)
  { const j = await mkJob('AB300CC', 'Toyota', 'Hilux', 'CLOSED'); const r = await mkReq(j, 'Bomba de agua', 'refrigeracion', 'CLOSED', { selectedAt: ago(40), createdAt: ago(220) }); await mkQuote(r, stores[0], 56000, 'SELECTED', ago(170)); }
  // 4..6) con orden: PAGADO / EN CAMINO / ENTREGADO
  const mkOrder = async (plate, brand, model, desc, slug, st, { part, deliv = false, picked = false, deliveredAt = null } = {}) => {
    const j = await mkJob(plate, brand, model, st === 'DELIVERED' ? 'DONE' : 'PAID');
    const r = await mkReq(j, desc, slug, st, { selectedAt: ago(300), createdAt: ago(400) });
    const q = await mkQuote(r, stores[0], part, 'SELECTED', ago(360));
    const commission = Math.round(part * 0.05);
    await prisma.order.create({ data: { requestId: r.id, quoteId: q.id, mechanicId: mech.id, storeId: stores[0], partAmount: part, commissionPct: 5, commissionAmount: commission, freightAmount: 6000, total: part + commission + 6000, status: st, deliveryId: deliv ? rider?.id : null, arrivedPickupAt: picked ? ago(70) : null, pickedAt: picked ? ago(60) : null, deliveredAt } });
    return r;
  };
  await mkOrder('AB400DD', 'Chevrolet', 'S10', 'Amortiguadores (par)', 'suspension', 'PAID', { part: 88000 });
  await mkOrder('AB500EE', 'Renault', 'Duster', 'Radiador', 'refrigeracion', 'SHIPPED', { part: 73000, deliv: true, picked: true });
  const rDel = await mkOrder('AB600FF', 'Ford', 'Ranger', 'Disco de freno (par)', 'frenos', 'DELIVERED', { part: 64000, deliv: true, picked: true, deliveredAt: ago(20) });
  if (rider) { const o = await prisma.order.findUnique({ where: { requestId: rDel.id }, select: { id: true } }); if (o) await prisma.rating.create({ data: { orderId: o.id, fromId: mech.id, toId: rider.id, kind: 'DELIVERY', stars: 5, comment: 'Rapidísimo, todo perfecto.' } }).catch(() => {}); }
  // 7) CANCELADO (no pagó a tiempo)
  { const j = await mkJob('AB700GG', 'Peugeot', '208', 'CANCELLED'); const r = await mkReq(j, 'Correa de distribución', 'motor', 'CANCELLED', { selectedAt: ago(2000), createdAt: ago(2100) }); await mkQuote(r, stores[0], 42000, 'SELECTED', ago(2050)); }

  console.log('• Demo de pedidos sembrado (abierto / cotizado / elegido / pagado / en camino / entregado / cancelado).');
}

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

  // Pedidos de demo solo si se pide explícitamente (SEED_DEMO=1). E2E y prod NO lo activan.
  if (process.env.SEED_DEMO) await seedDemoPedidos();

  console.log('✅ Seed OK');
  console.log('Cuentas (password: ' + TEST_PASSWORD + '):');
  accounts.forEach((a) => console.log('  -', a.role.padEnd(9), a.email));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
