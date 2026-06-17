// Datos DEMO para ver la app local "llena": pedidos/cotizaciones en todos los estados,
// fechadas hoy / hace 1 semana / hace 1 mes. Usa las cuentas seed (mecánico/vendedor/repartidor).
// Idempotente: borra lo DEMO previo (jobs con code 'DEMO-...') y vuelve a crear.
//   Uso:  node prisma/seed-demo.mjs     (apunta a la DATABASE_URL del .env = tu DB local)
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

const MIN = 60 * 1000, DAY = 24 * 60 * 60 * 1000;
// usuarios demo (mecánicos/comercios/repartidores): mail @demo.rat para poder borrarlos al re-correr
const SURNAMES = ['Gómez', 'Pérez', 'Rodríguez', 'López', 'Fernández', 'Martínez', 'García', 'Sánchez', 'Romero', 'Díaz', 'Torres', 'Ruiz', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Suárez', 'Ramírez', 'Vega', 'Cabrera'];
const FIRST = ['Diego', 'Martín', 'Lucas', 'Javier', 'Pablo', 'Nicolás', 'Sergio', 'Gabriel', 'Hernán', 'Matías', 'Federico', 'Ramiro', 'Andrés', 'Tomás', 'Iván', 'Cristian', 'Marcelo', 'Gonzalo', 'Ezequiel', 'Damián'];
const BARRIOS = ['Centro', 'Belgrano', 'El Cóndor', 'San Francisco III', 'Las Quintas', 'Melipal', 'Ñireco', 'Jardín Botánico', 'Villa Los Coihues', 'Pilar I'];
const pick = (arr, n) => { const c = [...arr]; const out = []; for (let j = 0; j < n && c.length; j++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return out; };
const VEHS = [['Fiat', 'Cronos', '1.3'], ['Volkswagen', 'Gol', '1.6'], ['Toyota', 'Etios', '1.5'], ['Chevrolet', 'Onix', '1.0 Turbo'], ['Renault', 'Kangoo', '1.6'], ['Ford', 'Ka', '1.5'], ['Peugeot', '208', '1.6'], ['Fiat', 'Toro', '2.0 TDI']];
const PARTS = ['Pastillas de freno delanteras', 'Disco de freno', 'Filtro de aceite', 'Amortiguador delantero', 'Bomba de agua', 'Correa de distribución', 'Bujías x4', 'Kit de embrague'];

// state -> cómo queda job/request/quote/order
const MAP = {
  pendiente:      { job: 'OPEN', req: 'OPEN', activeWin: true },                                          // comercio: Pendiente de cotizar
  esperando:      { job: 'OPEN', req: 'QUOTED', activeWin: true, quote: 'SENT' },                          // comercio: Esperando decisión
  sin_respuesta:  { job: 'OPEN', req: 'QUOTED', quote: 'SENT' },                                           // comercio: Sin respuesta (ventana vencida)
  esperando_pago: { job: 'CLOSED', req: 'CLOSED', quote: 'SELECTED', selected: true },                     // comercio: Esperando pago
  cancelada:      { job: 'CANCELLED', req: 'CANCELLED', quote: 'SENT' },                                   // comercio: Cancelada
  pagada:         { job: 'PAID', req: 'PAID', quote: 'SELECTED', order: 'PAID' },                          // concretada, esperando repartidor
  en_camino:      { job: 'PAID', req: 'SHIPPED', quote: 'SELECTED', order: 'SHIPPED', mine: true },        // repartidor la tomó
  entregada:      { job: 'DONE', req: 'DELIVERED', quote: 'SELECTED', order: 'DELIVERED' },                // concretada
  cc_pendiente:   { job: 'DONE', req: 'DELIVERED', quote: 'SELECTED', order: 'DELIVERED', cc: true },       // por cobrar (cuenta corriente)
  cc_cobrada:     { job: 'DONE', req: 'DELIVERED', quote: 'SELECTED', order: 'DELIVERED', cc: true, settled: true },
};

async function main() {
  // CANDADO: SOLO local. Si DATABASE_URL no apunta a localhost, abortar (nunca tocar prod/staging).
  const url = process.env.DATABASE_URL || '';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    console.error('⛔ seed-demo es SOLO local: DATABASE_URL no apunta a localhost/127.0.0.1. Abortado (no toco prod/staging).');
    process.exit(1);
  }

  const mech = await prisma.user.findUnique({ where: { email: 'mecanico@repuestosaltoque.com.ar' } });
  const store = await prisma.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' } });
  const courier = await prisma.user.findUnique({ where: { email: 'repartidor@repuestosaltoque.com.ar' } });
  if (!mech || !store) throw new Error('Faltan las cuentas seed. Corré primero: npm run db:seed');
  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  const catId = (i) => cats[i % cats.length]?.id ?? null;

  // limpiar DEMO previo (orden -> request[cascada quote] -> job)
  const prev = await prisma.job.findMany({ where: { code: { startsWith: 'DEMO-' } }, select: { id: true } });
  if (prev.length) {
    const ids = prev.map((j) => j.id);
    const reqs = await prisma.request.findMany({ where: { jobId: { in: ids } }, select: { id: true } });
    await prisma.order.deleteMany({ where: { requestId: { in: reqs.map((r) => r.id) } } });
    await prisma.request.deleteMany({ where: { jobId: { in: ids } } });
    await prisma.job.deleteMany({ where: { id: { in: ids } } });
    console.log(`🧹 borrados ${ids.length} pedidos DEMO previos`);
  }
  // limpiar usuarios DEMO previos (@demo.rat) — cascada perfiles + store_categories
  const delUsers = await prisma.user.deleteMany({ where: { email: { endsWith: '@demo.rat' } } });
  if (delUsers.count) console.log(`🧹 borrados ${delUsers.count} usuarios DEMO previos`);

  let i = 0;
  async function make(state, when, winOverride) {
    const s = MAP[state];
    const [brand, model, motor] = VEHS[i % VEHS.length];
    const desc = PARTS[i % PARTS.length];
    const plate = 'DM' + String(100 + i).padStart(3, '0') + 'XX';
    const price = 15000 + (i % 8) * 6000;
    const code = (p) => `DEMO-${p}-${i}-${Math.random().toString(36).slice(2, 6)}`;
    // ventana: la pasada por parámetro, si no futura cuando está activa, si no relativa a la fecha (vencida)
    const win = winOverride || (s.activeWin ? new Date(Date.now() + 8 * MIN) : new Date(when.getTime() + 10 * MIN));

    const job = await prisma.job.create({ data: { code: code('J'), mechanicId: mech.id, plate, brand, model, year: 2020, status: s.job, windowEndsAt: ['OPEN', 'CLOSED'].includes(s.job) ? win : null, createdAt: when, updatedAt: when } });
    const req = await prisma.request.create({ data: { code: code('R'), mechanicId: mech.id, jobId: job.id, brand, model, year: 2020, extraInfo: motor, categoryId: catId(i), description: desc, status: s.req, windowEndsAt: ['OPEN', 'CLOSED'].includes(s.req) ? win : null, selectedAt: s.selected || s.order ? when : null, createdAt: when, photoUrls: [] } });
    let quote = null;
    if (s.quote) quote = await prisma.requestQuote.create({ data: { requestId: req.id, storeId: store.id, alias: 'Repuestos Centro', partBrand: 'Bosch', optionLabel: 'Original / OEM', price, warranty: '6 meses', status: s.quote, createdAt: when, photoUrls: [] } });
    if (s.order && quote) {
      const commission = Math.round(price * 0.10), freight = 5000, cc = !!s.cc;
      await prisma.order.create({ data: {
        requestId: req.id, quoteId: quote.id, mechanicId: mech.id, storeId: store.id,
        partAmount: price, commissionPct: 10, commissionAmount: commission, freightAmount: freight, mpFeeAmount: 0,
        creditAccount: cc, creditSettledAt: s.settled ? when : null, total: (cc ? 0 : price) + commission + freight, status: s.order,
        deliveryId: ['SHIPPED', 'DELIVERED'].includes(s.order) ? courier?.id ?? null : null,
        pickupPin: s.order !== 'PAID' ? '1234' : null, deliveryPin: s.order !== 'PAID' ? '5678' : null,
        deliveredAt: s.order === 'DELIVERED' ? when : null, createdAt: when,
      } });
    }
    i++;
  }

  const HOY = new Date(Date.now() - 2 * 3600 * 1000); // hoy, 2hs atrás
  const SEMANA = new Date(Date.now() - 7 * DAY);
  const MES = new Date(Date.now() - 30 * DAY);

  // HOY: estados activos (ventana abierta) + concretadas recientes
  for (const st of ['pendiente', 'pendiente', 'esperando', 'esperando', 'esperando_pago', 'pagada', 'pagada', 'en_camino', 'cc_pendiente']) await make(st, HOY);
  // SEMANA: terminales + alguna sin respuesta (ventana vencida)
  for (const st of ['sin_respuesta', 'pagada', 'en_camino', 'entregada', 'entregada', 'cc_pendiente', 'cancelada']) await make(st, SEMANA);
  // MES: terminales
  for (const st of ['entregada', 'entregada', 'cc_cobrada', 'cc_cobrada', 'cancelada', 'pagada', 'sin_respuesta']) await make(st, MES);

  // VOLUMEN para ver el admin bien poblado: 50 cotizando + 50 pendientes + 50 concretados.
  // Ventana larga (2 días) para que coticen/pendientes sigan "vivas" en el comercio durante el demo.
  const variedad = i;
  const LONGWIN = new Date(Date.now() + 2 * DAY);
  for (let k = 0; k < 50; k++) await make('esperando', new Date(Date.now() - k * 5 * MIN), LONGWIN); // cotizando (QUOTED)
  for (let k = 0; k < 50; k++) await make('pendiente', new Date(Date.now() - k * 6 * MIN), LONGWIN); // pendientes (OPEN)
  for (let k = 0; k < 50; k++) await make('entregada', new Date(Date.now() - k * 7 * MIN));          // concretados

  // usuarios extra: 20 mecánicos + 20 comercios (categorías random 2-4) + 20 repartidores
  const passwordHash = await bcrypt.hash('repuestos123', 10);
  for (let k = 0; k < 20; k++) {
    const num = String(k + 1).padStart(2, '0');
    const mec = await prisma.user.create({ data: { email: `mec.demo${num}@demo.rat`, role: 'MECHANIC', name: `Taller ${SURNAMES[k]}`, status: 'ACTIVE', passwordHash } });
    await prisma.mechanicProfile.create({ data: { userId: mec.id, workshopName: `Taller ${SURNAMES[k]}`, barrio: BARRIOS[k % BARRIOS.length] } });

    const com = await prisma.user.create({ data: { email: `com.demo${num}@demo.rat`, role: 'STORE', name: `Repuestos ${SURNAMES[k]}`, status: 'ACTIVE', passwordHash } });
    await prisma.storeProfile.create({ data: { userId: com.id, tradeName: `Repuestos ${SURNAMES[k]}`, barrio: BARRIOS[k % BARRIOS.length], ivaCondition: 'RESPONSABLE_INSCRIPTO' } });
    const picked = pick(cats, 2 + Math.floor(Math.random() * 3));
    await prisma.storeCategory.createMany({ data: picked.map((cat) => ({ storeId: com.id, categoryId: cat.id })) });

    const rep = await prisma.user.create({ data: { email: `rep.demo${num}@demo.rat`, role: 'DELIVERY', name: `${FIRST[k]} ${SURNAMES[k]}`, status: 'ACTIVE', passwordHash } });
    await prisma.deliveryProfile.create({ data: { userId: rep.id, vehicleType: 'MOTO', docsOk: true } });
  }
  console.log('👥 usuarios demo: 20 mecánicos + 20 comercios (con rubros random) + 20 repartidores (pass repuestos123, mail @demo.rat)');

  console.log(`✅ DEMO creado: ${i} pedidos.`);
  console.log(`   - ${variedad} variados (hoy / hace 1 semana / hace 1 mes), todos los estados`);
  console.log('   - 50 cotizando + 50 pendientes + 50 concretados (para ver el admin poblado)');
  console.log('   Logueate con: mecanico@ / vendedor@ / repartidor@ (pass repuestos123).');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
