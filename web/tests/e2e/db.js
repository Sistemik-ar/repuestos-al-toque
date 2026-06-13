// Acceso directo a la base desde los E2E (para simular paso del tiempo, leer estados, etc).
import fs from 'fs';
import path from 'path';
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
