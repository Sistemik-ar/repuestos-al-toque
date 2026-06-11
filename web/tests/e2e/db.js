// Acceso directo a la base desde los E2E (para simular paso del tiempo, leer estados, etc).
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

let client;
export function db() {
  if (!client) {
    const env = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
    const url = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
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
  return { avg: Number(prof.ratingAvg), count: prof.ratingsCount };
}
