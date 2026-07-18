import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: { setting: { findMany: vi.fn(), upsert: vi.fn() } } }));

import { prisma } from '@/lib/db';
import { getTelegramConfig, setTelegramConfig, sendTelegram, tgNotifyNewJob, tgNotifyOrphanPayment } from '@/lib/telegram';

// config activa por defecto en cada test
const activo = () => prisma.setting.findMany.mockResolvedValue([
  { key: 'tgChatId', value: '123456789' },
  { key: 'tgEnabled', value: 'true' },
]);

// payload del último sendMessage
const sent = (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  delete process.env.MP_TEST_ACCESS_TOKEN;
  delete process.env.APP_URL;
});
afterEach(() => vi.unstubAllGlobals());

const okFetch = () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', f);
  return f;
};

describe('getTelegramConfig', () => {
  it('lee chat y switch de la tabla Setting', async () => {
    activo();
    expect(await getTelegramConfig()).toEqual({ configured: true, chatId: '123456789', enabled: true });
  });
  it('si la base falla devuelve apagado en vez de romper', async () => {
    prisma.setting.findMany.mockRejectedValue(new Error('db caída'));
    expect(await getTelegramConfig()).toEqual({ configured: true, chatId: '', enabled: false });
  });
  it('sin TELEGRAM_BOT_TOKEN queda marcado como no configurado', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    activo();
    expect((await getTelegramConfig()).configured).toBe(false);
  });
});

describe('setTelegramConfig', () => {
  it('guarda chat y switch como settings', async () => {
    await setTelegramConfig({ chatId: ' 123 ', enabled: true });
    expect(prisma.setting.upsert).toHaveBeenCalledTimes(2);
    const guardado = Object.fromEntries(prisma.setting.upsert.mock.calls.map(([a]) => [a.where.key, a.create.value]));
    expect(guardado).toEqual({ tgChatId: '123', tgEnabled: 'true' });
  });

  it('el switch apagado se guarda como "false", no como vacío', async () => {
    await setTelegramConfig({ chatId: '', enabled: false });
    const guardado = Object.fromEntries(prisma.setting.upsert.mock.calls.map(([a]) => [a.where.key, a.create.value]));
    expect(guardado).toEqual({ tgChatId: '', tgEnabled: 'false' });
  });
});

describe('tgNotifyOrphanPayment', () => {
  it('avisa con el código del pedido y el monto formateado', async () => {
    activo();
    const f = okFetch();
    await tgNotifyOrphanPayment({ ref: 'job::j1', code: 'T-134', paidAmount: 120000 });
    const { text } = sent(f);
    expect(text).toContain('CANCELADO');
    expect(text).toContain('#T-134');
    expect(text).toContain('$120.000');
    expect(text).toMatch(/Devolvé la plata/);
  });

  it('sin código legible cae al ref crudo, y sin monto lo dice', async () => {
    activo();
    const f = okFetch();
    await tgNotifyOrphanPayment({ ref: 'job::j1', paidAmount: null });
    const { text } = sent(f);
    expect(text).toContain('job::j1');
    expect(text).toContain('monto desconocido');
  });

  it('no manda nada si los avisos están apagados', async () => {
    prisma.setting.findMany.mockResolvedValue([]);
    const f = okFetch();
    expect(await tgNotifyOrphanPayment({ ref: 'job::j1', paidAmount: 1 })).toEqual({ ok: false, skipped: true });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('sendTelegram', () => {
  it('postea a la API del bot', async () => {
    activo();
    const f = okFetch();
    expect(await sendTelegram('hola')).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(sent(f).chat_id).toBe('123456789');
  });

  it('no manda nada si falta el token del bot', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const f = okFetch();
    expect((await sendTelegram('hola')).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('no manda nada si los avisos están apagados', async () => {
    prisma.setting.findMany.mockResolvedValue([{ key: 'tgChatId', value: '1' }, { key: 'tgEnabled', value: 'false' }]);
    const f = okFetch();
    expect((await sendTelegram('hola')).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('marca los mensajes de staging como PRUEBAS', async () => {
    process.env.MP_TEST_ACCESS_TOKEN = 'TEST-xxx';
    activo();
    const f = okFetch();
    await sendTelegram('hola');
    expect(sent(f).text).toContain('PRUEBAS');
  });

  it('devuelve el motivo cuando Telegram rechaza, sin lanzar', async () => {
    activo();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false, description: 'chat not found' }) }));
    expect(await sendTelegram('hola')).toEqual({ ok: false, error: 'chat not found' });
  });
});

describe('tgNotifyNewJob', () => {
  const job = { code: 'T-134', plate: 'AB123CD', brand: 'Ford', model: 'Ranger', year: 2018, repuesto: 'Frenos', mechanicName: 'Juan Pérez', zona: 'Bariloche' };

  it('arma el aviso con patente, vehículo y repuesto', async () => {
    activo();
    const f = okFetch();
    await tgNotifyNewJob(job);
    const { text } = sent(f);
    expect(text).toContain('AB123CD');
    expect(text).toContain('Ford Ranger 2018');
    expect(text).toContain('Frenos');
    expect(text).toContain('#T-134');
  });

  it('el bloque a reenviar lleva SOLO rubro y link', async () => {
    activo();
    const f = okFetch();
    await tgNotifyNewJob(job);
    const copia = sent(f).text.match(/<pre>([\s\S]*?)<\/pre>/)[1];

    expect(copia).toContain('Frenos');
    expect(copia).toContain('https://repuestosaltoque.com.ar/comercio');
    // nada del pedido sale de la plataforma por WhatsApp: para verlo hay que entrar a cotizar
    expect(copia).not.toContain('AB123CD'); // patente
    expect(copia).not.toContain('Ranger'); // vehículo
    expect(copia).not.toContain('Juan Pérez'); // mecánico
    expect(copia).not.toContain('Bariloche'); // zona
  });

  it('el admin sí ve el detalle completo, fuera del bloque', async () => {
    activo();
    const f = okFetch();
    await tgNotifyNewJob(job);
    const { text } = sent(f);
    const afuera = text.replace(/<pre>[\s\S]*?<\/pre>/, '');
    expect(afuera).toContain('AB123CD');
    expect(afuera).toContain('Ford Ranger 2018');
    expect(afuera).toContain('Juan Pérez');
    expect(afuera).toContain('Bariloche');
  });

  it('escapa el HTML de los datos que carga el mecánico', async () => {
    activo();
    const f = okFetch();
    await tgNotifyNewJob({ ...job, model: '<b>Ranger</b>', mechanicName: 'Juan & Cía' });
    const { text } = sent(f);
    expect(text).toContain('&lt;b&gt;Ranger&lt;/b&gt;');
    expect(text).toContain('Juan &amp; Cía');
  });

  it('tolera un vehículo sin datos', async () => {
    activo();
    const f = okFetch();
    await tgNotifyNewJob({ code: 'T-1', plate: 'AB123CD' });
    const { text } = sent(f);
    expect(text).toContain('Vehículo sin datos');
    expect(text).toContain('A confirmar');
  });

  it('no manda nada si el aviso está apagado', async () => {
    prisma.setting.findMany.mockResolvedValue([]);
    const f = okFetch();
    expect(await tgNotifyNewJob(job)).toEqual({ ok: false, skipped: true });
    expect(f).not.toHaveBeenCalled();
  });
});
