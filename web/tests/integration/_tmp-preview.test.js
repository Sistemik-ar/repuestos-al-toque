// TEMPORAL — manda el aviso REAL a Telegram para aprobar el texto. Se borra al terminar.
import './_ipv4-setup.mjs';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('@/lib/session', () => ({ getSession: vi.fn(), invalidateStatusCache: vi.fn() }));
vi.mock('@/lib/push', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
  sendPushMany: vi.fn().mockResolvedValue(undefined),
  notifyDeliveryNewTrip: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { publishJob } from '@/app/actions/data';

const CHAT = '561393061';
const SUF = `prev${Date.now()}`;
let mecanico, categoria;

beforeAll(async () => {
  mecanico = await prisma.user.create({ data: { email: `mec-${SUF}@test.local`, role: 'MECHANIC', status: 'ACTIVE', name: 'Taller San Martín' } });
  categoria = await prisma.category.upsert({ where: { slug: `frenos-${SUF}` }, update: {}, create: { slug: `frenos-${SUF}`, name: 'Frenos' } });
  await Promise.all([
    prisma.setting.upsert({ where: { key: 'tgChatId' }, update: { value: CHAT }, create: { key: 'tgChatId', value: CHAT } }),
    prisma.setting.upsert({ where: { key: 'tgEnabled' }, update: { value: 'true' }, create: { key: 'tgEnabled', value: 'true' } }),
  ]);
});

afterAll(async () => {
  await prisma.request.deleteMany({ where: { mechanicId: mecanico.id } });
  await prisma.job.deleteMany({ where: { mechanicId: mecanico.id } });
  await prisma.user.delete({ where: { id: mecanico.id } });
  await prisma.category.delete({ where: { id: categoria.id } }).catch(() => {});
  await prisma.setting.deleteMany({ where: { key: { in: ['tgChatId', 'tgEnabled'] } } });
  await prisma.$disconnect();
});

describe('preview del texto nuevo', () => {
  it('manda el aviso tal cual lo va a ver Jorge', async () => {
    getSession.mockResolvedValue({ id: mecanico.id, role: 'MECHANIC' });
    const n = Math.random().toString(36).slice(2, 6);
    const job = await prisma.job.create({
      data: { code: `T-${n}`, mechanicId: mecanico.id, plate: 'AF412KX', brand: 'Volkswagen', model: 'Amarok', year: 2019, status: 'DRAFT' },
    });
    await prisma.request.create({ data: { code: `R-${SUF}`, mechanicId: mecanico.id, jobId: job.id, categoryId: categoria.id, status: 'OPEN', description: 'Pastillas' } });
    expect(await publishJob(job.id)).toEqual({ ok: true });
  });
});
