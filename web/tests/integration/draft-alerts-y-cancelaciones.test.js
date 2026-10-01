// Borradores olvidados y registro de cancelaciones, contra la base REAL.
//
// Motivo (prod, oct 2026): de 24 trabajos cancelados, 11 nunca se habían publicado — el mecánico
// cargaba el repuesto, creía que ya estaba pedido y no tocaba "Solicitar presupuesto". Y como las
// cancelaciones no dejaban rastro, no había forma de saber si las hizo el mecánico, el admin o el
// barrido de 24hs. Acá se prueba el aviso a los 30 min y que cada camino deje su audit_log.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('@/lib/session', () => ({ getSession: vi.fn(), invalidateStatusCache: vi.fn() }));
vi.mock('@/lib/mercadopago', async (importOriginal) => ({
  ...(await importOriginal()),
  deactivatePaymentLink: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/push', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
  sendPushMany: vi.fn().mockResolvedValue(undefined),
  notifyDeliveryNewTrip: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { sendPush } from '@/lib/push';
import { alertStaleDrafts, ACTION } from '@/lib/draft-alerts';
import { cancelJob, cancelItem, getMyRequests } from '@/app/actions/data';
import { adminCancelUnpaidRequest } from '@/app/actions/admin-jobs';

const SUF = `da${Date.now()}`;
const MIN = 60 * 1000;
let admin, mecanico, categoria;

const stubFetch = () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', f);
  return f;
};
const tgTexts = (f) => f.mock.calls.filter((c) => String(c[0]).includes('/sendMessage')).map((c) => JSON.parse(c[1].body).text);

const setAvisos = (enabled) => Promise.all([
  prisma.setting.upsert({ where: { key: 'tgChatId' }, update: { value: '999' }, create: { key: 'tgChatId', value: '999' } }),
  prisma.setting.upsert({ where: { key: 'tgEnabled' }, update: { value: String(enabled) }, create: { key: 'tgEnabled', value: String(enabled) } }),
]);

// updatedAt es @updatedAt: Prisma lo pisa en cada update, así que se retrocede por SQL
const envejecer = (table, id, ms) => prisma.$executeRawUnsafe(`UPDATE ${table} SET updated_at = $1 WHERE id = $2`, new Date(Date.now() - ms), id);

async function crearTrabajo({ status = 'DRAFT', items = 1, itemStatus = 'OPEN', extra = {} } = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  const job = await prisma.job.create({ data: { code: `J-${n}`, mechanicId: mecanico.id, plate: 'AB123CD', brand: 'Ford', model: 'Ranger', year: 2018, status, ...extra } });
  const reqs = [];
  for (let i = 0; i < items; i++) {
    reqs.push(await prisma.request.create({ data: { code: `R-${n}-${i}`, mechanicId: mecanico.id, jobId: job.id, categoryId: categoria.id, status: itemStatus, description: `Pastillas ${i}` } }));
  }
  return { job, reqs };
}

const logsDe = (entityId) => prisma.auditLog.findMany({ where: { entityId }, orderBy: { id: 'asc' } });

beforeAll(async () => {
  admin = await prisma.user.create({ data: { email: `admin-${SUF}@test.local`, role: 'ADMIN', status: 'ACTIVE', name: 'Admin' } });
  mecanico = await prisma.user.create({ data: { email: `mec-${SUF}@test.local`, role: 'MECHANIC', status: 'ACTIVE', name: 'Javi Torres', phone: '2944123456' } });
  categoria = await prisma.category.upsert({ where: { slug: `frenos-${SUF}` }, update: {}, create: { slug: `frenos-${SUF}`, name: 'Frenos' } });
  // borradores de otras corridas/E2E no deben meterse en estos tests
  await prisma.job.updateMany({ where: { status: 'DRAFT', mechanicId: { not: mecanico.id } }, data: { status: 'CANCELLED' } });
});

afterAll(async () => {
  const jobs = await prisma.job.findMany({ where: { mechanicId: mecanico.id }, select: { id: true } });
  const reqs = await prisma.request.findMany({ where: { mechanicId: mecanico.id }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...jobs, ...reqs].map((x) => x.id) } } });
  await prisma.request.deleteMany({ where: { mechanicId: mecanico.id } });
  await prisma.job.deleteMany({ where: { mechanicId: mecanico.id } });
  await prisma.user.deleteMany({ where: { id: { in: [admin.id, mecanico.id] } } });
  await prisma.category.delete({ where: { id: categoria.id } }).catch(() => {});
  await prisma.setting.deleteMany({ where: { key: { in: ['tgChatId', 'tgEnabled'] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token-de-prueba';
  delete process.env.MP_TEST_ACCESS_TOKEN;
  getSession.mockResolvedValue({ id: mecanico.id, role: 'MECHANIC' });
});

describe('aviso de borrador sin enviar', () => {
  it('a los 30 min avisa al mecánico (push) y al admin (Telegram, con teléfono) — una sola vez', async () => {
    await setAvisos(true);
    const { job } = await crearTrabajo();
    await envejecer('jobs', job.id, 45 * MIN);
    const f = stubFetch();

    expect((await alertStaleDrafts()).sent).toBe(1);
    const [text] = tgTexts(f);
    expect(text).toContain('SIN ENVIAR');
    expect(text).toContain(`#${job.code}`);
    expect(text).toContain('Javi Torres');
    expect(text).toContain('2944123456');
    expect(text).toContain('Pastillas 0');
    expect(sendPush).toHaveBeenCalledWith(mecanico.id, expect.objectContaining({ url: `/mecanico/trabajo?id=${job.id}` }));
    expect((await logsDe(job.id)).map((l) => l.action)).toEqual([ACTION]);

    // segundo barrido: ya avisado, no repite
    const f2 = stubFetch();
    expect((await alertStaleDrafts()).sent).toBe(0);
    expect(tgTexts(f2)).toHaveLength(0);
    // y no tocó el trabajo: sigue en borrador, sin reiniciar su reloj de 24hs
    const j = await prisma.job.findUnique({ where: { id: job.id } });
    expect(j.status).toBe('DRAFT');
    expect(Date.now() - j.updatedAt.getTime()).toBeGreaterThan(40 * MIN);
  });

  it('no avisa borradores recientes, publicados, vacíos ni ya vencidos (>24hs)', async () => {
    await setAvisos(true);
    const reciente = await crearTrabajo();
    await envejecer('jobs', reciente.job.id, 10 * MIN);
    const publicado = await crearTrabajo({ status: 'OPEN' });
    await envejecer('jobs', publicado.job.id, 60 * MIN);
    const vacio = await crearTrabajo({ itemStatus: 'CANCELLED' });
    await envejecer('jobs', vacio.job.id, 60 * MIN);
    const viejo = await crearTrabajo();
    await envejecer('jobs', viejo.job.id, 25 * 60 * MIN);
    stubFetch();

    expect((await alertStaleDrafts()).sent).toBe(0);
    expect(sendPush).not.toHaveBeenCalled();
    // limpieza para los tests siguientes
    await prisma.job.updateMany({ where: { id: { in: [reciente.job.id, vacio.job.id, viejo.job.id] } }, data: { status: 'CANCELLED' } });
  });

  it('con Telegram apagado igual avisa al mecánico por push', async () => {
    await setAvisos(false);
    const { job } = await crearTrabajo();
    await envejecer('jobs', job.id, 45 * MIN);
    const f = stubFetch();

    expect((await alertStaleDrafts()).sent).toBe(1);
    expect(tgTexts(f)).toHaveLength(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it('el barrido perezoso (al leer) dispara el aviso', async () => {
    await setAvisos(true);
    const { job } = await crearTrabajo();
    await envejecer('jobs', job.id, 45 * MIN);
    const f = stubFetch();

    await getMyRequests(); // primer barrido del módulo: no está throttleado
    expect(tgTexts(f).some((t) => t.includes(`#${job.code}`))).toBe(true);
  });
});

describe('cada cancelación deja su audit_log', () => {
  it('mecánico: "Cancelar pedido"', async () => {
    const { job } = await crearTrabajo({ status: 'OPEN' });
    expect(await cancelJob(job.id)).toEqual({ ok: true });
    const [log] = await logsDe(job.id);
    expect(log).toMatchObject({ action: 'JOB_CANCELLED', actorId: mecanico.id, payload: { by: 'mechanic', via: 'cancelar_pedido', from: 'OPEN' } });
  });

  it('mecánico: quitar el ÚNICO repuesto de un borrador cancela el trabajo y lo registra', async () => {
    const { job, reqs } = await crearTrabajo();
    expect(await cancelItem(reqs[0].id)).toEqual({ ok: true });
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CANCELLED');
    expect((await logsDe(reqs[0].id))[0]).toMatchObject({ action: 'REQUEST_CANCELLED', payload: { via: 'desestimar', jobId: job.id } });
    expect((await logsDe(job.id))[0]).toMatchObject({ action: 'JOB_CANCELLED', actorId: mecanico.id, payload: { via: 'ultimo_item_desestimado', from: 'DRAFT' } });
  });

  it('mecánico: quitar uno de dos repuestos NO cancela el trabajo', async () => {
    const { job, reqs } = await crearTrabajo({ items: 2 });
    await cancelItem(reqs[0].id);
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('DRAFT');
    expect(await logsDe(job.id)).toHaveLength(0);
  });

  it('sistema: el barrido de 24hs registra el borrador abandonado como automático', async () => {
    process.env.MP_TEST_ACCESS_TOKEN = 'TEST-x'; // modo test: el barrido no se throttlea
    const { job } = await crearTrabajo();
    await envejecer('jobs', job.id, 25 * 60 * MIN);
    stubFetch();

    await getMyRequests();
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CANCELLED');
    expect((await logsDe(job.id))[0]).toMatchObject({ action: 'JOB_CANCELLED', actorId: null, payload: { by: 'system', via: 'borrador_abandonado_24h' } });
  });

  it('admin: cancelar pedido impago', async () => {
    getSession.mockResolvedValue({ id: admin.id, role: 'ADMIN' });
    const { job, reqs } = await crearTrabajo({ status: 'OPEN' });
    expect((await adminCancelUnpaidRequest(reqs[0].id)).ok).toBe(true);
    expect((await logsDe(job.id))[0]).toMatchObject({ action: 'JOB_CANCELLED', actorId: admin.id, payload: { by: 'admin', via: 'admin_cancelar_impago', requestId: reqs[0].id } });
  });
});
