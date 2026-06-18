// Seed GRANDE para STAGING (Neon): muchos usuarios + muchísimos pedidos/cotizaciones repartidos
// en ~120 días y en todos los estados, para ver el histórico y las estadísticas del admin bien llenas.
// Incluye 10 bandas de tarifa de envío, cuentas corrientes y ratings (reputaciones).
// Idempotente: borra lo de seeds previos (usuarios @seed.rat, jobs 'SEED-*') y vuelve a crear.
//   Uso:  DATABASE_URL="<neon directo, sin -pooler>" node prisma/seed-staging.mjs
//   (corré antes: prisma db push + npm run db:seed para tener categorías y cuentas canónicas)
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
const prisma = new PrismaClient();

const DAY = 86400000, HOUR = 3600000, MIN = 60000;
const rnd = (a, b) => a + Math.random() * (b - a);
const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => { const c = [...arr]; const out = []; for (let j = 0; j < n && c.length; j++) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return out; };
const weighted = (pairs) => { const tot = pairs.reduce((a, [, w]) => a + w, 0); let r = Math.random() * tot; for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
async function insMany(model, rows) { for (const c of chunk(rows, 300)) if (c.length) await prisma[model].createMany({ data: c, skipDuplicates: true }); }

const SURN = ['Gómez', 'Pérez', 'Rodríguez', 'López', 'Fernández', 'Martínez', 'García', 'Sánchez', 'Romero', 'Díaz', 'Torres', 'Ruiz', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Suárez', 'Ramírez', 'Vega', 'Cabrera', 'Molina', 'Ortiz', 'Silva', 'Rojas', 'Castro', 'Morales', 'Herrera', 'Aguilar', 'Núñez', 'Ríos'];
const FIRST = ['Diego', 'Martín', 'Lucas', 'Javier', 'Pablo', 'Nicolás', 'Sergio', 'Gabriel', 'Hernán', 'Matías', 'Federico', 'Ramiro', 'Andrés', 'Tomás', 'Iván', 'Cristian', 'Marcelo', 'Gonzalo', 'Ezequiel', 'Damián'];
const BARRIOS = ['Centro', 'Belgrano', 'El Cóndor', 'San Francisco III', 'Las Quintas', 'Melipal', 'Ñireco', 'Jardín Botánico', 'Villa Los Coihues', 'Pilar I', 'Las Margaritas', 'El Faldeo'];
const CALLES = ['Mitre', 'Onelli', 'Elflein', 'Beschtedt', 'Moreno', 'Av. Pioneros', 'Av. Bustillo', 'Gallardo', 'Frey', 'Quaglia', 'Tiscornia', 'Los Notros'];
const VEHS = [['Fiat', 'Cronos', '1.3'], ['Volkswagen', 'Gol', '1.6'], ['Toyota', 'Etios', '1.5'], ['Chevrolet', 'Onix', '1.0 Turbo'], ['Renault', 'Kangoo', '1.6'], ['Ford', 'Ka', '1.5'], ['Peugeot', '208', '1.6'], ['Fiat', 'Toro', '2.0 TDI'], ['Toyota', 'Hilux', '2.8 TDI'], ['VW', 'Amarok', '2.0 TDI'], ['Ford', 'Ranger', '3.2'], ['Chevrolet', 'S10', '2.8']];
const PARTS = ['Pastillas de freno delanteras', 'Disco de freno', 'Filtro de aceite', 'Amortiguador delantero', 'Bomba de agua', 'Correa de distribución', 'Bujías x4', 'Kit de embrague', 'Radiador', 'Filtro de aire', 'Rótula', 'Cilindro de freno', 'Alternador', 'Bobina de encendido'];
const BRANDS = ['Bosch', 'Cobreq', 'Corven', 'Denso', 'Ferodo', 'Fras-le', 'Gates', 'Mahle', 'Mann Filter', 'Monroe', 'NGK', 'SKF', 'TRW', 'Valeo', 'ZF'];
const addr = () => `${pickOne(CALLES)} ${rndInt(50, 4500)}`;
// bbox Bariloche
const lat = () => rnd(-41.18, -41.08), lng = () => rnd(-71.45, -71.25);

async function main() {
  const url = process.env.DATABASE_URL || '';
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const isNeon = /neon\.tech/.test(url);
  if (!isLocal && !isNeon) {
    console.error('⛔ seed-staging: DATABASE_URL no es local ni Neon (staging). Abortado para no tocar producción.');
    process.exit(1);
  }
  console.log(`🌱 seed-staging contra ${isNeon ? 'Neon (staging)' : 'local'} …`);

  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  const canon = await prisma.user.findMany({ where: { email: { in: ['mecanico@repuestosaltoque.com.ar', 'vendedor@repuestosaltoque.com.ar', 'repartidor@repuestosaltoque.com.ar'] } } });
  if (!cats.length || canon.length < 3) throw new Error('Faltan categorías o cuentas canónicas. Corré antes: prisma db push + npm run db:seed');
  const canonMech = canon.find((u) => u.role === 'MECHANIC');
  const canonStore = canon.find((u) => u.role === 'STORE');
  const canonRep = canon.find((u) => u.role === 'DELIVERY');

  // ---------- limpieza del seed previo ----------
  const prevUsers = await prisma.user.findMany({ where: { email: { endsWith: '@seed.rat' } }, select: { id: true } });
  const prevIds = prevUsers.map((u) => u.id);
  const prevJobs = await prisma.job.findMany({ where: { code: { startsWith: 'SEED-' } }, select: { id: true } });
  const jIds = prevJobs.map((j) => j.id);
  if (jIds.length) {
    const rs = await prisma.request.findMany({ where: { jobId: { in: jIds } }, select: { id: true } });
    const rIds = rs.map((r) => r.id);
    const os = await prisma.order.findMany({ where: { requestId: { in: rIds } }, select: { id: true } });
    await prisma.rating.deleteMany({ where: { orderId: { in: os.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { requestId: { in: rIds } } });
    await prisma.request.deleteMany({ where: { jobId: { in: jIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jIds } } });
  }
  if (prevIds.length) {
    await prisma.creditPayment.deleteMany({ where: { OR: [{ storeId: { in: prevIds } }, { mechanicId: { in: prevIds } }] } });
    await prisma.creditAccount.deleteMany({ where: { OR: [{ storeId: { in: prevIds } }, { mechanicId: { in: prevIds } }] } });
    await prisma.user.deleteMany({ where: { id: { in: prevIds } } });
  }
  console.log(`🧹 limpieza: ${jIds.length} jobs + ${prevIds.length} usuarios de seeds previos`);

  // ---------- usuarios ----------
  const passwordHash = await bcrypt.hash('repuestos123', 10);
  const N_MEC = 28, N_STORE = 22, N_REP = 10;
  const users = [], mechProfiles = [], storeProfiles = [], repProfiles = [], storeCats = [];
  const mechs = [], stores = [], reps = [];

  for (let k = 0; k < N_MEC; k++) {
    const id = randomUUID(), name = `Taller ${SURN[k % SURN.length]} ${k + 1}`, lastLoginAt = Math.random() < 0.8 ? new Date(Date.now() - rnd(0, 20) * DAY) : null;
    users.push({ id, email: `mec.seed${k}@seed.rat`, role: 'MECHANIC', name, status: 'ACTIVE', passwordHash, lastLoginAt });
    mechProfiles.push({ userId: id, workshopName: name, address: addr(), barrio: pickOne(BARRIOS), lat: lat(), lng: lng() });
    mechs.push(id);
  }
  for (let k = 0; k < N_STORE; k++) {
    const id = randomUUID(), name = `Repuestos ${SURN[k % SURN.length]}`, lastLoginAt = Math.random() < 0.85 ? new Date(Date.now() - rnd(0, 15) * DAY) : null;
    users.push({ id, email: `com.seed${k}@seed.rat`, role: 'STORE', name, status: 'ACTIVE', passwordHash, lastLoginAt });
    storeProfiles.push({ userId: id, tradeName: name, address: addr(), barrio: pickOne(BARRIOS), lat: lat(), lng: lng(), ivaCondition: 'RESPONSABLE_INSCRIPTO' });
    for (const cat of pickN(cats, rndInt(2, 5))) storeCats.push({ storeId: id, categoryId: cat.id });
    stores.push(id);
  }
  for (let k = 0; k < N_REP; k++) {
    const id = randomUUID(), lastLoginAt = Math.random() < 0.9 ? new Date(Date.now() - rnd(0, 10) * DAY) : null;
    users.push({ id, email: `rep.seed${k}@seed.rat`, role: 'DELIVERY', name: `${FIRST[k % FIRST.length]} ${SURN[k % SURN.length]}`, status: 'ACTIVE', passwordHash, lastLoginAt });
    repProfiles.push({ userId: id, vehicleType: Math.random() < 0.5 ? 'MOTO' : 'AUTO', plate: 'AB' + rndInt(100, 999) + 'CD', docsOk: true });
    reps.push(id);
  }
  await insMany('user', users);
  await insMany('mechanicProfile', mechProfiles);
  await insMany('storeProfile', storeProfiles);
  await insMany('deliveryProfile', repProfiles);
  await insMany('storeCategory', storeCats);

  // participantes = seed + canónicos (para que esas cuentas también tengan datos ricos)
  const allMech = [...mechs, canonMech.id];
  const allStore = [...stores, canonStore.id];
  const allRep = [...reps, canonRep.id];
  const catId = (i) => cats[i % cats.length].id;

  // ---------- tarifas de envío: 10 bandas ----------
  await prisma.shippingTariff.deleteMany({});
  await insMany('shippingTariff', Array.from({ length: 10 }, (_, i) => ({ uptoKm: (i + 1) * 2, price: 4500 + i * 700 })));

  // ---------- settings ----------
  for (const [key, value] of [['commissionPct', '10'], ['mpFeePct', '6.39'], ['mpFeeEnabled', 'false'], ['minShip', '5000']]) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  // ---------- cuentas corrientes (entre mech y store seed) ----------
  const ccAccounts = [], ccPairs = [];
  const usedPairs = new Set();
  for (let k = 0; k < 16; k++) {
    const m = pickOne(mechs), s = pickOne(stores), key = m + s;
    if (usedPairs.has(key)) continue; usedPairs.add(key);
    const active = Math.random() < 0.8;
    ccAccounts.push({ id: randomUUID(), mechanicId: m, storeId: s, adminStatus: 'APPROVED', storeStatus: active ? 'APPROVED' : 'PENDING', active, adminActedAt: new Date(Date.now() - rnd(5, 60) * DAY), storeActedAt: active ? new Date(Date.now() - rnd(5, 60) * DAY) : null, createdAt: new Date(Date.now() - rnd(5, 90) * DAY) });
    if (active) ccPairs.push({ m, s });
  }
  await insMany('creditAccount', ccAccounts);

  // ---------- pedidos / cotizaciones / órdenes / ratings ----------
  const N_DEALS = 460;
  const jobs = [], requests = [], quotes = [], orders = [], ratings = [], payments = [];
  // acumuladores de reputación por usuario (para setear los perfiles)
  const repAgg = {}; // toId -> { sum, n }
  const bumpRep = (toId, stars) => { (repAgg[toId] ||= { sum: 0, n: 0 }); repAgg[toId].sum += stars; repAgg[toId].n++; };
  const points = {}; // toId -> entregas/ventas concretadas
  const bumpPts = (id) => { points[id] = (points[id] || 0) + 1; };

  for (let i = 0; i < N_DEALS; i++) {
    const state = weighted([['entregada', 44], ['esperando', 16], ['pendiente', 9], ['cancelada', 11], ['pagada', 8], ['en_camino', 7], ['cc_entregada', 5]]);
    // fecha: 38% últimos 7d, 30% 8-30d, 22% 31-90d, 10% 91-120d
    const bucket = weighted([['w', 38], ['m', 30], ['q', 22], ['o', 10]]);
    const daysBack = bucket === 'w' ? rnd(0, 7) : bucket === 'm' ? rnd(8, 30) : bucket === 'q' ? rnd(31, 90) : rnd(91, 120);
    const when = new Date(Date.now() - daysBack * DAY - rnd(0, 12) * HOUR);
    const mech = pickOne(allMech);
    const [brand, model, motor] = pickOne(VEHS);
    const desc = pickOne(PARTS);
    const jobId = randomUUID(), reqId = randomUUID();
    const plate = 'SD' + String(i).padStart(3, '0') + 'AA';
    const cc = state === 'cc_entregada';
    const isOrder = ['entregada', 'pagada', 'en_camino', 'cc_entregada'].includes(state);
    const isDelivered = state === 'entregada' || state === 'cc_entregada';
    const isShipped = state === 'en_camino';
    const isSelected = isOrder || state === 'cancelada';
    const jobStatus = isDelivered ? 'DONE' : isShipped ? 'PAID' : state === 'pagada' ? 'PAID' : state === 'cancelada' ? 'CANCELLED' : state === 'esperando' ? 'OPEN' : 'OPEN';
    const reqStatus = isDelivered ? 'DELIVERED' : isShipped ? 'SHIPPED' : state === 'pagada' ? 'PAID' : state === 'cancelada' ? 'CANCELLED' : state === 'esperando' ? 'QUOTED' : 'OPEN';
    const winOpen = ['OPEN'].includes(reqStatus) && daysBack < 1; // ventana viva solo si es de hoy
    const win = ['OPEN', 'QUOTED'].includes(reqStatus) ? new Date(when.getTime() + (winOpen ? 2 * DAY : 10 * MIN)) : null;

    jobs.push({ id: jobId, code: `SEED-J-${i}-${Math.random().toString(36).slice(2, 6)}`, mechanicId: mech, plate, brand, model, year: rndInt(2014, 2024), status: jobStatus, windowEndsAt: ['OPEN', 'CLOSED'].includes(jobStatus) ? win : null, createdAt: when, updatedAt: when });
    requests.push({ id: reqId, code: `SEED-R-${i}-${Math.random().toString(36).slice(2, 6)}`, mechanicId: mech, jobId, brand, model, year: 2020, extraInfo: motor, categoryId: catId(i), description: desc, status: reqStatus, windowEndsAt: ['OPEN', 'QUOTED'].includes(reqStatus) ? win : null, selectedAt: isSelected ? when : null, createdAt: when, photoUrls: [] });

    // cotizaciones: 1-3 comercios distintos (las "pendiente" no tienen, para verlas sin cotizar)
    const quoters = state === 'pendiente' ? [] : pickN(allStore, rndInt(1, 3));
    const chosenStore = isOrder || state === 'cancelada' ? quoters[0] : null;
    let chosenQuoteId = null, chosenPrice = 0;
    for (const sId of quoters) {
      const qId = randomUUID();
      const price = rndInt(8, 130) * 1000;
      const isChosen = sId === chosenStore;
      if (isChosen) { chosenQuoteId = qId; chosenPrice = price; }
      quotes.push({ id: qId, requestId: reqId, storeId: sId, alias: 'Casa ' + (sId.slice(0, 4)), partBrand: pickOne(BRANDS), optionLabel: 'Original / OEM', price, warranty: pickOne(['3 meses', '6 meses', '1 año']), status: isChosen ? 'SELECTED' : 'SENT', createdAt: new Date(when.getTime() + rnd(1, 180) * MIN), photoUrls: [] });
    }

    if (isOrder && chosenQuoteId) {
      const orderId = randomUUID();
      const commission = Math.round(chosenPrice * 0.10);
      const freight = rndInt(45, 90) * 100;
      const rep = (isShipped || isDelivered) ? pickOne(allRep) : null;
      const isCC = cc && Math.random() < 1; // las cc_entregada son CC
      const pickedAt = isDelivered ? new Date(when.getTime() + rnd(0.5, 2) * HOUR) : null;
      const deliveredAt = isDelivered ? new Date(when.getTime() + rnd(2, 4) * HOUR) : null;
      orders.push({
        id: orderId, requestId: reqId, quoteId: chosenQuoteId, mechanicId: mech, storeId: chosenStore,
        partAmount: chosenPrice, commissionPct: 10, commissionAmount: commission, freightAmount: freight, mpFeeAmount: 0,
        creditAccount: isCC, creditSettledAt: isCC && Math.random() < 0.5 ? deliveredAt : null,
        total: (isCC ? 0 : chosenPrice) + commission + freight, status: isDelivered ? 'DELIVERED' : isShipped ? 'SHIPPED' : 'PAID',
        deliveryId: rep, pickupPin: rep ? '1234' : null, deliveryPin: rep ? '5678' : null, pickedAt, deliveredAt, createdAt: when,
      });
      if (isDelivered) {
        bumpPts(chosenStore); if (rep) bumpPts(rep);
        const sStars = rndInt(3, 5), dStars = rndInt(3, 5);
        ratings.push({ id: randomUUID(), orderId, fromId: mech, toId: chosenStore, kind: 'SELLER', stars: sStars, createdAt: deliveredAt });
        ratings.push({ id: randomUUID(), orderId, fromId: mech, toId: chosenStore, kind: 'PRODUCT', stars: rndInt(3, 5), createdAt: deliveredAt });
        bumpRep(chosenStore, sStars);
        if (rep) { ratings.push({ id: randomUUID(), orderId, fromId: mech, toId: rep, kind: 'DELIVERY', stars: dStars, createdAt: deliveredAt }); bumpRep(rep, dStars); }
        // pago parcial de cuenta corriente
        if (isCC && Math.random() < 0.5) payments.push({ id: randomUUID(), storeId: chosenStore, mechanicId: mech, amount: Math.round(chosenPrice * rnd(0.3, 1)), note: 'SEED pago parcial', createdAt: new Date(deliveredAt.getTime() + rnd(1, 20) * DAY) });
      }
    }
  }

  await insMany('job', jobs);
  await insMany('request', requests);
  await insMany('requestQuote', quotes);
  await insMany('order', orders);
  await insMany('rating', ratings);
  await insMany('creditPayment', payments);

  // ---------- setear reputaciones (avg/count/points) en los perfiles ----------
  for (const [id, agg] of Object.entries(repAgg)) {
    const avg = Math.round((agg.sum / agg.n) * 10) / 10, count = agg.n, pts = points[id] || 0;
    const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (u?.role === 'STORE') await prisma.storeProfile.update({ where: { userId: id }, data: { ratingAvg: avg, ratingsCount: count, points: pts } }).catch(() => {});
    else if (u?.role === 'DELIVERY') await prisma.deliveryProfile.update({ where: { userId: id }, data: { ratingAvg: avg, ratingsCount: count, points: pts } }).catch(() => {});
  }

  console.log(`✅ seed-staging listo:`);
  console.log(`   👥 ${N_MEC} mecánicos + ${N_STORE} comercios + ${N_REP} repartidores (@seed.rat, pass repuestos123) + las cuentas canónicas`);
  console.log(`   📦 ${jobs.length} pedidos · ${quotes.length} cotizaciones · ${orders.length} órdenes · ${ratings.length} reseñas (repartidos en ~120 días)`);
  console.log(`   🚚 10 bandas de tarifa · ${ccAccounts.length} cuentas corrientes · ${payments.length} pagos parciales`);
  console.log(`   Entrá como admin@ para ver las estadísticas; o cualquier *.seed${0}@seed.rat`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
