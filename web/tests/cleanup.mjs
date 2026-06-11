// Limpia los datos que generan los E2E. Uso: node --env-file=.env tests/cleanup.mjs
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

const reqs = await p.request.findMany({ where: { description: { contains: 'E2E' } }, select: { id: true, jobId: true } });
const ids = reqs.map((r) => r.id);
const jobIds = [...new Set(reqs.map((r) => r.jobId).filter(Boolean))];
if (ids.length) {
  await p.order.deleteMany({ where: { requestId: { in: ids } } });
  await p.requestQuote.deleteMany({ where: { requestId: { in: ids } } });
  await p.request.deleteMany({ where: { id: { in: ids } } });
}
if (jobIds.length) await p.job.deleteMany({ where: { id: { in: jobIds }, requests: { none: {} } } });
// borradores de prueba sin ítems
await p.job.deleteMany({ where: { requests: { none: {} }, status: 'DRAFT' } });

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

console.log(`limpieza: ${ids.length} pedidos E2E, ${testUsers.length} usuarios de prueba, CC reseteada`);
await p.$disconnect();
