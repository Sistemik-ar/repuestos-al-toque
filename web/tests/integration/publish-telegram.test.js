// El cableado del aviso de Telegram, contra la base REAL.
//
// Los unitarios prueban que tgNotifyNewJob arma bien el mensaje, pero eso no dice nada sobre si
// publicar un trabajo efectivamente lo llama: el hook de publishJob vive dentro de un try/catch,
// así que si estuviera mal cableado no habría error ni log — simplemente no llegaría nada.
// Acá se ejercita la cadena completa (publishJob -> import dinámico -> config leída de la base ->
// armado del mensaje); lo único que se corta es la salida a la red.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('@/lib/session', () => ({ getSession: vi.fn(), invalidateStatusCache: vi.fn() }));
vi.mock('@/lib/push', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
  sendPushMany: vi.fn().mockResolvedValue(undefined),
  notifyDeliveryNewTrip: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { publishJob } from '@/app/actions/data';

const SUF = `tg${Date.now()}`;
let mecanico, categoria;

// payload del sendMessage que salió a Telegram
const enviado = (f) => JSON.parse(f.mock.calls[0][1].body);

const stubFetch = () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', f);
  return f;
};

async function crearBorrador({ plate = 'AB123CD', brand = 'Ford', model = 'Ranger', year = 2018 } = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  const job = await prisma.job.create({ data: { code: `J-${n}`, mechanicId: mecanico.id, plate, brand, model, year, status: 'DRAFT' } });
  await prisma.request.create({ data: { code: `R-${n}`, mechanicId: mecanico.id, jobId: job.id, categoryId: categoria.id, status: 'OPEN', description: 'Pastillas' } });
  return job;
}

const setAvisos = (enabled) => Promise.all([
  prisma.setting.upsert({ where: { key: 'tgChatId' }, update: { value: '999' }, create: { key: 'tgChatId', value: '999' } }),
  prisma.setting.upsert({ where: { key: 'tgEnabled' }, update: { value: String(enabled) }, create: { key: 'tgEnabled', value: String(enabled) } }),
]);

beforeAll(async () => {
  mecanico = await prisma.user.create({ data: { email: `mec-${SUF}@test.local`, role: 'MECHANIC', status: 'ACTIVE', name: 'Juan Pérez' } });
  categoria = await prisma.category.upsert({ where: { slug: `frenos-${SUF}` }, update: {}, create: { slug: `frenos-${SUF}`, name: 'Frenos' } });
});

afterAll(async () => {
  await prisma.request.deleteMany({ where: { mechanicId: mecanico.id } });
  await prisma.job.deleteMany({ where: { mechanicId: mecanico.id } });
  await prisma.user.delete({ where: { id: mecanico.id } });
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

describe('publishJob dispara el aviso de Telegram', () => {
  it('manda el mensaje con patente, vehículo y rubro del trabajo publicado', async () => {
    await setAvisos(true);
    const job = await crearBorrador();
    const f = stubFetch();

    expect(await publishJob(job.id)).toEqual({ ok: true });

    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toContain('/sendMessage');
    const { chat_id, text } = enviado(f);
    expect(chat_id).toBe('999');
    expect(text).toContain('AB123CD');
    expect(text).toContain('Ford Ranger 2018');
    expect(text).toContain('Frenos');
    expect(text).toContain(`#${job.code}`);
    // el detalle es para el admin: el bloque que se reenvía por WhatsApp lleva solo rubro y link
    expect(text).toContain('Juan Pérez');
    const copia = text.match(/<pre>([\s\S]*?)<\/pre>/)[1];
    expect(copia).toContain('Frenos');
    expect(copia).toContain('/comercio');
    expect(copia).not.toContain('AB123CD');
    expect(copia).not.toContain('Juan Pérez');
  });

  it('el trabajo se publica igual si el aviso está apagado', async () => {
    await setAvisos(false);
    const job = await crearBorrador();
    const f = stubFetch();

    expect(await publishJob(job.id)).toEqual({ ok: true });
    expect(f).not.toHaveBeenCalled();
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('OPEN');
  });

  it('si Telegram se cae, el trabajo se publica lo mismo', async () => {
    await setAvisos(true);
    const job = await crearBorrador();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND api.telegram.org')));

    // lo importante: publicar NO puede depender de que ande el aviso
    expect(await publishJob(job.id)).toEqual({ ok: true });
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('OPEN');
    const reqs = await prisma.request.findMany({ where: { jobId: job.id }, select: { status: true } });
    expect(reqs.every((r) => r.status === 'OPEN')).toBe(true);
  });

  it('no avisa dos veces: un trabajo ya publicado se rechaza', async () => {
    await setAvisos(true);
    const job = await crearBorrador();
    stubFetch();
    await publishJob(job.id);

    const f = stubFetch();
    expect(await publishJob(job.id)).toEqual({ error: 'Este trabajo ya fue publicado' });
    expect(f).not.toHaveBeenCalled();
  });
});
