// Acceso directo a la base desde los E2E (para simular paso del tiempo, leer estados, etc).
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

let client;
export function db() {
  if (!client) {
    // Prioridad: DATABASE_URL del entorno (lo setea `npm run e2e:local` con la DB local);
    // si no está, cae al .env (DB remota). Así los tests apuntan a la misma DB que el server.
    let url = process.env.DATABASE_URL;
    if (!url) {
      const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
      url = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
    }
    client = new PrismaClient({ datasources: { db: { url } } });
  }
  return client;
}

// Setea un ajuste del negocio (settings) — p.ej. el contador de cotización quoteWindowMin.
export async function setSetting(key, value) {
  const p = db();
  await p.setting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
}

// "Viaja en el tiempo": vence la ventana de un trabajo ya
export async function expireJobWindow(plate) {
  const p = db();
  const past = new Date(Date.now() - 60000);
  const job = await p.job.findFirst({ where: { plate }, orderBy: { createdAt: 'desc' } });
  if (!job) throw new Error('job no encontrado: ' + plate);
  await p.job.update({ where: { id: job.id }, data: { windowEndsAt: past } });
  await p.request.updateMany({ where: { jobId: job.id }, data: { windowEndsAt: past } });
  return job.id;
}

// Hace que el link de pago tenga >24hs (para probar la cancelación automática)
export async function backdateJobSelection(plate) {
  const p = db();
  const past = new Date(Date.now() - 25 * 3600 * 1000);
  const job = await p.job.findFirst({ where: { plate }, orderBy: { createdAt: 'desc' } });
  if (!job) throw new Error('job no encontrado: ' + plate);
  await p.job.update({ where: { id: job.id }, data: { selectedAt: past } });
  await p.request.updateMany({ where: { jobId: job.id }, data: { selectedAt: past } });
  return job.id;
}

// Limpia los rubros asignados al comercio (vuelve a "ve todas las categorías").
// Se usa en afterAll del test de categorías para no afectar a los demás specs.
export async function clearStoreCategories(email = 'vendedor@repuestosaltoque.com.ar') {
  const p = db();
  const u = await p.user.findUnique({ where: { email } });
  if (u) await p.storeCategory.deleteMany({ where: { storeId: u.id } });
}

// Crea (o reutiliza) un SEGUNDO comercio para los tests multi-comercio, sin pasar por el alta
// con Nominatim (evita flakiness). Devuelve su email. Le pone coords de Bariloche.
export async function ensureStore2(email = 'e2e-store2@rat.test') {
  const p = db();
  const passwordHash = await bcrypt.hash('repuestos123', 10);
  const u = await p.user.upsert({
    where: { email },
    update: { status: 'ACTIVE', passwordHash, role: 'STORE', name: 'Repuestos Dos' },
    create: { email, status: 'ACTIVE', passwordHash, role: 'STORE', name: 'Repuestos Dos' },
  });
  await p.storeProfile.upsert({
    where: { userId: u.id },
    update: {},
    create: { userId: u.id, tradeName: 'Repuestos Dos', barrio: 'Centro', address: 'Mitre 200', lat: -41.134, lng: -71.31, ivaCondition: 'RESPONSABLE_INSCRIPTO' },
  });
  return email;
}

// Restaura la contraseña de las cuentas seed (tras probar el reseteo desde el admin).
export async function restoreSeedPassword(emails = ['vendedor@repuestosaltoque.com.ar']) {
  const p = db();
  const passwordHash = await bcrypt.hash('repuestos123', 10);
  await p.user.updateMany({ where: { email: { in: emails } }, data: { passwordHash } });
}

// Crea/activa una cuenta corriente entre el mecánico y el comercio seed (para probar el checkout con CC).
export async function ensureCC(mechEmail = 'mecanico@repuestosaltoque.com.ar', storeEmail = 'vendedor@repuestosaltoque.com.ar') {
  const p = db();
  const mech = await p.user.findUnique({ where: { email: mechEmail } });
  const store = await p.user.findUnique({ where: { email: storeEmail } });
  await p.creditAccount.upsert({
    where: { mechanicId_storeId: { mechanicId: mech.id, storeId: store.id } },
    update: { active: true, adminStatus: 'APPROVED', storeStatus: 'APPROVED' },
    create: { mechanicId: mech.id, storeId: store.id, active: true, adminStatus: 'APPROVED', storeStatus: 'APPROVED' },
  });
}

// Reactiva las cuentas seed (tras probar la suspensión desde el admin).
export async function reactivateSeed(emails = ['vendedor@repuestosaltoque.com.ar']) {
  const p = db();
  await p.user.updateMany({ where: { email: { in: emails } }, data: { status: 'ACTIVE' } });
}

// Restaura el email del comercio seed (lo identifica por su tradeName 'Repuestos Centro'),
// tras probar el cambio de email desde el admin.
export async function restoreSeedEmail() {
  const p = db();
  const prof = await p.storeProfile.findFirst({ where: { tradeName: 'Repuestos Centro' }, select: { userId: true } });
  if (prof) await p.user.update({ where: { id: prof.userId }, data: { email: 'vendedor@repuestosaltoque.com.ar' } }).catch(() => {});
}

// Siembra una venta YA CONCRETADA (Order) directo en la base, sin pasar por el flujo de pago/MP.
// Sirve para probar "Por cobrar" / cuenta corriente sin depender de Mercado Pago.
export async function seedCreditSale({ mechEmail = 'mecanico@repuestosaltoque.com.ar', storeEmail = 'vendedor@repuestosaltoque.com.ar', desc = 'Pastillas E2E CC', amount = 45000, status = 'DELIVERED', creditAccount = true } = {}) {
  const p = db();
  const mech = await p.user.findUnique({ where: { email: mechEmail } });
  const store = await p.user.findUnique({ where: { email: storeEmail } });
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const job = await p.job.create({ data: { code: 'JCC' + stamp, mechanicId: mech.id, plate: 'CC' + (stamp % 100000), brand: 'Toyota', model: 'Hilux', status: status === 'DELIVERED' ? 'DONE' : 'PAID' } });
  const req = await p.request.create({ data: { code: 'RCC' + stamp, mechanicId: mech.id, jobId: job.id, description: desc, status: status === 'DELIVERED' ? 'DELIVERED' : 'PAID', photoUrls: [] } });
  const quote = await p.requestQuote.create({ data: { requestId: req.id, storeId: store.id, alias: 'Casa A', price: amount, status: 'SELECTED', photoUrls: [] } });
  const order = await p.order.create({ data: { requestId: req.id, quoteId: quote.id, mechanicId: mech.id, storeId: store.id, partAmount: amount, commissionAmount: 0, total: 0, creditAccount, status } });
  return { jobId: job.id, requestId: req.id, quoteId: quote.id, orderId: order.id };
}

// Siembra un pedido donde el mecánico YA eligió la cotización del comercio pero NO pagó
// (request CLOSED + quote SELECTED, sin orden). Para probar el estado "Esperando pago".
export async function seedChosenQuote({ mechEmail = 'mecanico@repuestosaltoque.com.ar', storeEmail = 'vendedor@repuestosaltoque.com.ar', desc = 'Pastillas elegidas E2E', price = 38000 } = {}) {
  const p = db();
  const mech = await p.user.findUnique({ where: { email: mechEmail } });
  const store = await p.user.findUnique({ where: { email: storeEmail } });
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const job = await p.job.create({ data: { code: 'JCH' + stamp, mechanicId: mech.id, plate: 'CH' + (stamp % 100000), brand: 'Fiat', model: 'Punto', status: 'CLOSED' } });
  const req = await p.request.create({ data: { code: 'RCH' + stamp, mechanicId: mech.id, jobId: job.id, description: desc, status: 'CLOSED', selectedAt: new Date(), photoUrls: [] } });
  const quote = await p.requestQuote.create({ data: { requestId: req.id, storeId: store.id, alias: 'Casa A', price, status: 'SELECTED', photoUrls: [] } });
  return { jobId: job.id, requestId: req.id, quoteId: quote.id };
}

// Borra una venta/pedido sembrado (orden -> request[cascada quote] -> job).
export async function removeSeededSale({ orderId, requestId, jobId } = {}) {
  const p = db();
  if (orderId) await p.order.delete({ where: { id: orderId } }).catch(() => {});
  if (requestId) await p.request.delete({ where: { id: requestId } }).catch(() => {});
  if (jobId) await p.job.delete({ where: { id: jobId } }).catch(() => {});
}

// Borra los trabajos (y sus requests/orders) de una patente — limpieza de tests que crean pedidos por UI.
export async function removeJobByPlate(plate) {
  const p = db();
  const jobs = await p.job.findMany({ where: { plate }, select: { id: true } });
  for (const j of jobs) {
    const reqs = await p.request.findMany({ where: { jobId: j.id }, select: { id: true } });
    for (const r of reqs) await p.order.deleteMany({ where: { requestId: r.id } }).catch(() => {});
    await p.request.deleteMany({ where: { jobId: j.id } }).catch(() => {});
    await p.job.delete({ where: { id: j.id } }).catch(() => {});
  }
}

export async function storeRatingStats() {
  const p = db();
  const u = await p.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' } });
  const prof = await p.storeProfile.findUnique({ where: { userId: u.id } });
  return { avg: Number(prof.ratingAvg), count: prof.ratingsCount, points: prof.points };
}

export async function deliveryRatingStats() {
  const p = db();
  const u = await p.user.findUnique({ where: { email: 'repartidor@repuestosaltoque.com.ar' } });
  const prof = await p.deliveryProfile.findUnique({ where: { userId: u.id } });
  return { avg: Number(prof.ratingAvg), count: prof.ratingsCount, points: prof.points };
}

// Promedio REAL según la tabla de reseñas (para verificar que el perfil quedó consistente)
export async function avgFromRatings(email, kinds) {
  const p = db();
  const u = await p.user.findUnique({ where: { email } });
  const rows = await p.rating.findMany({ where: { toId: u.id, kind: { in: kinds } }, select: { stars: true } });
  if (!rows.length) return { avg: 0, count: 0 };
  const avg = rows.reduce((a, r) => a + r.stars, 0) / rows.length;
  return { avg: Math.round(avg * 10) / 10, count: rows.length };
}
