import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/telegram', () => ({
  getTelegramConfig: vi.fn(),
  setTelegramConfig: vi.fn(),
  sendTelegram: vi.fn(),
  tgConfigured: vi.fn(() => true),
}));

import { getSession } from '@/lib/session';
import { getTelegramConfig, setTelegramConfig, sendTelegram, tgConfigured } from '@/lib/telegram';
import { getTelegramSettings, saveTelegramSettings, detectTelegramChat, sendTelegramTest } from '@/app/actions/telegram';

const NO_AUTH = { error: 'No autorizado' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  getSession.mockResolvedValue({ id: 'a1', role: 'ADMIN' });
  tgConfigured.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

const stubFetch = (payload, ok = true) => {
  const f = vi.fn().mockResolvedValue({ ok, json: async () => payload });
  vi.stubGlobal('fetch', f);
  return f;
};

describe('permisos', () => {
  it('todas las acciones son solo de admin', async () => {
    for (const role of ['MECHANIC', 'STORE', 'DELIVERY']) {
      getSession.mockResolvedValue({ id: 'u1', role });
      expect(await getTelegramSettings()).toEqual(NO_AUTH);
      expect(await saveTelegramSettings({ chatId: '1', enabled: true })).toEqual(NO_AUTH);
      expect(await detectTelegramChat()).toEqual(NO_AUTH);
      expect(await sendTelegramTest('1')).toEqual(NO_AUTH);
    }
    getSession.mockResolvedValue(null);
    expect(await getTelegramSettings()).toEqual(NO_AUTH);
    expect(setTelegramConfig).not.toHaveBeenCalled();
  });
});

describe('saveTelegramSettings', () => {
  it('guarda un chat válido', async () => {
    expect(await saveTelegramSettings({ chatId: ' 123456789 ', enabled: true })).toEqual({ ok: true });
    expect(setTelegramConfig).toHaveBeenCalledWith({ chatId: '123456789', enabled: true });
  });

  it('acepta el id negativo de un grupo', async () => {
    expect(await saveTelegramSettings({ chatId: '-1001234567890', enabled: true })).toEqual({ ok: true });
  });

  it('rechaza un chat que no es numérico cuando el aviso queda prendido', async () => {
    // el error típico: pegar el @usuario o el número de celular en vez del chat_id
    for (const malo of ['@jorge', '+5492944123456', 'jorge', '']) {
      const r = await saveTelegramSettings({ chatId: malo, enabled: true });
      expect(r.error).toMatch(/número/);
    }
    expect(setTelegramConfig).not.toHaveBeenCalled();
  });

  it('deja guardar cualquier cosa si el aviso está apagado', async () => {
    expect(await saveTelegramSettings({ chatId: '', enabled: false })).toEqual({ ok: true });
    expect(setTelegramConfig).toHaveBeenCalledWith({ chatId: '', enabled: false });
  });
});

describe('detectTelegramChat', () => {
  it('devuelve los chats que le escribieron al bot, sin repetir', async () => {
    stubFetch({ ok: true, result: [
      { message: { chat: { id: 111, first_name: 'Jorge', last_name: 'P' } } },
      { message: { chat: { id: 111, first_name: 'Jorge', last_name: 'P' } } },
      { message: { chat: { id: -222, title: 'Guardia finde' } } },
    ] });
    const r = await detectTelegramChat();
    expect(r.ok).toBe(true);
    expect(r.chats).toEqual([{ id: '-222', name: 'Guardia finde' }, { id: '111', name: 'Jorge P' }]);
  });

  it('explica qué hacer si nadie le escribió todavía', async () => {
    stubFetch({ ok: true, result: [] });
    expect((await detectTelegramChat()).error).toMatch(/\/start/);
  });

  it('avisa si falta el token del bot, sin llamar a Telegram', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const f = stubFetch({});
    expect((await detectTelegramChat()).error).toMatch(/TELEGRAM_BOT_TOKEN/);
    expect(f).not.toHaveBeenCalled();
  });

  it('propaga el motivo cuando Telegram responde error', async () => {
    stubFetch({ ok: false, description: 'Unauthorized' }, false);
    expect((await detectTelegramChat()).error).toBe('Unauthorized');
  });

  it('no rompe si la red falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    expect((await detectTelegramChat()).error).toBe('ENOTFOUND');
  });
});

describe('sendTelegramTest', () => {
  it('manda la prueba al chat que se está por guardar, aunque el aviso siga apagado', async () => {
    sendTelegram.mockResolvedValue({ ok: true });
    expect(await sendTelegramTest('123')).toEqual({ ok: true });
    expect(sendTelegram).toHaveBeenCalledWith(expect.stringContaining('Prueba'), { chatId: '123' });
  });

  it('sin chat explícito usa el guardado', async () => {
    sendTelegram.mockResolvedValue({ ok: true });
    await sendTelegramTest('');
    expect(sendTelegram).toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it('devuelve el motivo del rechazo de Telegram', async () => {
    sendTelegram.mockResolvedValue({ ok: false, error: 'chat not found' });
    expect(await sendTelegramTest('123')).toEqual({ error: 'chat not found' });
  });

  it('avisa si falta el token', async () => {
    tgConfigured.mockReturnValue(false);
    expect((await sendTelegramTest('123')).error).toMatch(/TELEGRAM_BOT_TOKEN/);
    expect(sendTelegram).not.toHaveBeenCalled();
  });
});

describe('getTelegramSettings', () => {
  it('devuelve la config al admin', async () => {
    getTelegramConfig.mockResolvedValue({ configured: true, chatId: '123', enabled: true });
    expect(await getTelegramSettings()).toEqual({ configured: true, chatId: '123', enabled: true });
  });
});
