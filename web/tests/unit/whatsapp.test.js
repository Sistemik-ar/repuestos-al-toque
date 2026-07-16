import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    setting: { findUnique: vi.fn() },
    waMessage: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    waContact: { updateMany: vi.fn().mockResolvedValue({}), findFirst: vi.fn() },
    waGuard: { findMany: vi.fn(), findFirst: vi.fn() },
    waReply: { create: vi.fn().mockResolvedValue({}) },
  },
}));

import { prisma } from '@/lib/db';
import {
  waConfigured, normalizeArPhone, fmtArPhone, maskArPhone, toWaId,
  sendWaTemplate, waNotify, processInboundText, applyStatusUpdate, WA_TEMPLATES,
} from '@/lib/whatsapp';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WHATSAPP_TOKEN = 'WA-token';
  process.env.WHATSAPP_PHONE_ID = 'PHONE1';
  delete process.env.WA_TEST_MODE;
  prisma.setting.findUnique.mockResolvedValue(null); // sin kill switch
});
afterEach(() => { vi.restoreAllMocks(); });

describe('números argentinos', () => {
  it('normaliza 10 dígitos válidos (con o sin prefijo 549/54)', () => {
    expect(normalizeArPhone('294 412 3456')).toBe('2944123456');
    expect(normalizeArPhone('5492944123456')).toBe('2944123456');
    expect(normalizeArPhone('542944123456')).toBe('2944123456');
  });
  it('rechaza 0 de área, 15, y largos incorrectos', () => {
    expect(normalizeArPhone('02944123456')).toBeNull(); // 11 dígitos con 0
    expect(normalizeArPhone('1544123456')).toBeNull(); // empieza con 15
    expect(normalizeArPhone('294412345')).toBeNull(); // 9 dígitos
    expect(normalizeArPhone('29441234567')).toBeNull(); // 11 dígitos
  });
  it('formatea y enmascara', () => {
    expect(fmtArPhone('2944123456')).toBe('+54 9 294 412 3456');
    expect(maskArPhone('2944123456')).toBe('+54 9 294 •••• 456');
    expect(toWaId('2944123456')).toBe('5492944123456');
  });
});

describe('configuración', () => {
  it('sin credenciales ni modo test -> deshabilitado', () => {
    delete process.env.WHATSAPP_TOKEN;
    expect(waConfigured()).toBe(false);
  });
  it('WA_TEST_MODE habilita sin credenciales (staging/local)', () => {
    delete process.env.WHATSAPP_TOKEN;
    process.env.WA_TEST_MODE = '1';
    expect(waConfigured()).toBe(true);
  });
});

describe('sendWaTemplate', () => {
  it('POST a /messages con la plantilla, es_AR y los parámetros en orden', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.1' }] }) });
    const r = await sendWaTemplate({ toPhone: '2944123456', event: 'cotizacion', params: { comercio: 'Comercio A', monto: '$48.500', repuesto: 'pastillas', link: 'https://rat/mecanico' } });
    expect(r.id).toBe('wamid.1');
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v20.0/PHONE1/messages');
    const body = JSON.parse(opts.body);
    expect(body.to).toBe('5492944123456');
    expect(body.template.name).toBe('rat_nueva_cotizacion');
    expect(body.template.language.code).toBe('es_AR');
    expect(body.template.components[0].parameters.map((p) => p.text)).toEqual(['Comercio A', '$48.500', 'pastillas', 'https://rat/mecanico']);
  });
  it('en modo test no llama a Meta', async () => {
    process.env.WA_TEST_MODE = '1';
    global.fetch = vi.fn();
    const r = await sendWaTemplate({ toPhone: '2944123456', event: 'prueba', params: {} });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.id).toBeTruthy();
  });
});

describe('waNotify — envío con log', () => {
  it('crea la fila del log y la marca como enviada con el id de Meta', async () => {
    prisma.waMessage.create.mockResolvedValue({ id: 'row1' });
    prisma.waMessage.update.mockResolvedValue({});
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.9' }] }) });
    await waNotify({ event: 'prueba', params: {}, targets: [{ phone: '2944123456', name: 'Jorge', role: 'admin' }] });
    expect(prisma.waMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.waMessage.create.mock.calls[0][0].data.body).toContain('aviso de prueba');
    const upd = prisma.waMessage.update.mock.calls[0][0];
    expect(upd.data.status).toBe('sent');
    expect(upd.data.waMessageId).toBe('wamid.9');
  });
  it('si Meta falla, el mensaje queda como fallido con el motivo', async () => {
    prisma.waMessage.create.mockResolvedValue({ id: 'row1' });
    prisma.waMessage.update.mockResolvedValue({});
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: 'template not found' } }) });
    await waNotify({ event: 'prueba', params: {}, targets: [{ phone: '2944123456' }] });
    const upd = prisma.waMessage.update.mock.calls[0][0];
    expect(upd.data.status).toBe('failed');
    expect(upd.data.failReason).toBe('template not found');
  });
  it('con el kill switch puesto NO envía ni loguea', async () => {
    prisma.setting.findUnique.mockResolvedValue({ key: 'waPaused', value: 'true' });
    global.fetch = vi.fn();
    await waNotify({ event: 'prueba', params: {}, targets: [{ phone: '2944123456' }] });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(prisma.waMessage.create).not.toHaveBeenCalled();
  });
  it('el código de verificación pasa aunque esté pausado (skipPauseCheck)', async () => {
    prisma.setting.findUnique.mockResolvedValue({ key: 'waPaused', value: 'true' });
    prisma.waMessage.create.mockResolvedValue({ id: 'row1' });
    prisma.waMessage.update.mockResolvedValue({});
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'w' }] }) });
    await waNotify({ event: 'verificacion', params: { codigo: '123456' }, targets: [{ phone: '2944123456' }], skipPauseCheck: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('processInboundText — respuestas al bot', () => {
  it('BAJA (con o sin signos) da de baja el contacto y lo registra', async () => {
    prisma.waContact.findFirst.mockResolvedValue(null);
    prisma.waGuard.findFirst.mockResolvedValue(null);
    const r = await processInboundText({ fromPhone: '5492944123456', fromName: 'Sur', body: ' baja! ' });
    expect(r.action).toBe('baja');
    expect(prisma.waContact.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { phone: '2944123456' },
      data: expect.objectContaining({ enabled: false }),
    }));
    expect(prisma.waReply.create.mock.calls[0][0].data.action).toBe('baja');
  });
  it('cualquier otro texto manda la auto-respuesta y registra "auto"', async () => {
    prisma.waContact.findFirst.mockResolvedValue(null);
    prisma.waGuard.findFirst.mockResolvedValue(null);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'w' }] }) });
    const r = await processInboundText({ fromPhone: '5492944123456', fromName: 'Marcos', body: 'gracias!' });
    expect(r.action).toBe('auto');
    expect(global.fetch).toHaveBeenCalledTimes(1); // la auto-respuesta (texto de sesión)
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).type).toBe('text');
    expect(prisma.waReply.create.mock.calls[0][0].data.action).toBe('auto');
  });
});

describe('applyStatusUpdate — estados del webhook', () => {
  it('avanza sent -> delivered', async () => {
    prisma.waMessage.findUnique.mockResolvedValue({ waMessageId: 'w1', status: 'sent' });
    prisma.waMessage.update.mockResolvedValue({});
    await applyStatusUpdate({ waMessageId: 'w1', status: 'delivered', timestamp: '1720000000' });
    expect(prisma.waMessage.update.mock.calls[0][0].data.status).toBe('delivered');
  });
  it('NO retrocede read -> delivered (Meta reenvía estados fuera de orden)', async () => {
    prisma.waMessage.findUnique.mockResolvedValue({ waMessageId: 'w1', status: 'read' });
    await applyStatusUpdate({ waMessageId: 'w1', status: 'delivered' });
    expect(prisma.waMessage.update).not.toHaveBeenCalled();
  });
  it('failed traduce el código de error de Meta', async () => {
    prisma.waMessage.findUnique.mockResolvedValue({ waMessageId: 'w1', status: 'sent' });
    prisma.waMessage.update.mockResolvedValue({});
    await applyStatusUpdate({ waMessageId: 'w1', status: 'failed', errors: [{ code: 131026 }] });
    expect(prisma.waMessage.update.mock.calls[0][0].data.failReason).toBe('El número no tiene WhatsApp');
  });
});

describe('plantillas', () => {
  it('los textos de referencia coinciden con lo que se manda a aprobar', () => {
    expect(WA_TEMPLATES.solicitud.body({ repuesto: 'Amortiguadores', vehiculo: 'Ford Fiesta 2017', zona: 'Bariloche', link: 'rat.ar/c' }))
      .toBe('🔧 Nueva solicitud: Amortiguadores · Ford Fiesta 2017 · Bariloche. Entrá a cotizar → rat.ar/c Respondé BAJA para dejar de recibir avisos.');
    expect(Object.keys(WA_TEMPLATES)).toEqual(['solicitud', 'cotizacion', 'pago', 'mp', 'verificacion', 'prueba']);
  });
});
