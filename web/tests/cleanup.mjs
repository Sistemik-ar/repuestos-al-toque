// Limpia los datos que generan los E2E. Uso: node --env-file=.env tests/cleanup.mjs
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const reqs = await p.request.findMany({ where: { description: { contains: 'E2E' } }, select: { id: true, jobId: true } });
const ids = reqs.map((r) => r.id);
const jobIds = [...new Set(reqs.map((r) => r.jobId).filter(Boolean))];
if (ids.length) {
  // las reseñas referencian la orden (FK): borrarlas antes que las órdenes
  const ordIds = (await p.order.findMany({ where: { requestId: { in: ids } }, select: { id: true } })).map((o) => o.id);
  if (ordIds.length) await p.rating.deleteMany({ where: { orderId: { in: ordIds } } });
  await p.order.deleteMany({ where: { requestId: { in: ids } } });
  await p.requestQuote.deleteMany({ where: { requestId: { in: ids } } });
  await p.request.deleteMany({ where: { id: { in: ids } } });
}
if (jobIds.length) await p.job.deleteMany({ where: { id: { in: jobIds }, requests: { none: {} } } });
// borradores de prueba sin ítems
await p.job.deleteMany({ where: { requests: { none: {} }, status: 'DRAFT' } });

// Reputación: ratingsCount/ratingAvg/points son SNAPSHOTS denormalizados. Al borrar reseñas E2E
// quedan desincronizados con la tabla `rating` y eso hacía fallar el primer intento de procesos-reparto
// (before=stale, after=recalculado). Los resincronizamos con lo que realmente quedó en la tabla.
for (const m of ['storeProfile', 'deliveryProfile']) {
  const kinds = m === 'storeProfile' ? ['SELLER', 'PRODUCT'] : ['DELIVERY'];
  const profs = await p[m].findMany({ select: { userId: true } });
  for (const { userId } of profs) {
    const rows = await p.rating.findMany({ where: { toId: userId, kind: { in: kinds } }, select: { stars: true } });
    const count = rows.length;
    const avg = count ? Math.round((rows.reduce((a, r) => a + r.stars, 0) / count) * 10) / 10 : 0;
    await p[m].update({ where: { userId }, data: { ratingsCount: count, ratingAvg: avg } }).catch(() => {});
  }
}

// La CC entre cuentas seed SOLO se resetea con --full (el equipo la usa para probar)
if (process.argv.includes('--full')) {
  const mech = await p.user.findUnique({ where: { email: 'mecanico@repuestosaltoque.com.ar' } });
  const store = await p.user.findUnique({ where: { email: 'vendedor@repuestosaltoque.com.ar' } });
  if (mech && store) await p.creditAccount.deleteMany({ where: { mechanicId: mech.id, storeId: store.id } });
}

const testUsers = await p.user.findMany({ where: { email: { startsWith: 'e2e-' } }, select: { id: true } });
for (const id of testUsers.map((u) => u.id)) {
  await p.storeProfile.deleteMany({ where: { userId: id } });
  await p.mechanicProfile.deleteMany({ where: { userId: id } });
  await p.deliveryProfile.deleteMany({ where: { userId: id } });
  await p.creditAccount.deleteMany({ where: { OR: [{ mechanicId: id }, { storeId: id }] } });
  await p.user.delete({ where: { id } }).catch(() => {});
}

console.log(`limpieza: ${ids.length} pedidos E2E, ${testUsers.length} usuarios de prueba, CC intacta (usar --full para resetearla)`);
await p.$disconnect();
