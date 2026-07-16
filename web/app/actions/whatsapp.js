'use server';
// Avisos por WhatsApp — server actions de configuración (comercio/mecánico) y del admin.
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { sendPushMany } from '@/lib/push';
import {
  waConfigured, waIsTest, waPaused, normalizeArPhone, fmtArPhone, maskArPhone,
  sendWaTemplate, waNotify, WA_TEMPLATES,
} from '@/lib/whatsapp';

const ROLE_WA = { STORE: 'comercio', MECHANIC: 'mecanico' };
const EVENTS = ['solicitud', 'cotizacion', 'pago', 'mp'];
const CODE_TTL_MS = 10 * 60 * 1000; // el código vence a los 10 minutos
const RESEND_MS = 30 * 1000; // antirre-spam del reenvío

const newCode = () => String(crypto.randomInt(100000, 1000000));

async function waSession() {
  const s = await getSession();
  if (!s || !ROLE_WA[s.role]) return null;
  return s;
}

// Manda el código de verificación y lo deja en el registro (contacto o guardia).
async function sendCode({ phone, name, role }) {
  const code = newCode();
  await waNotify({
    event: 'verificacion', params: { codigo: code },
    targets: [{ phone, name, role }], skipPauseCheck: true, // el código es funcional, no un aviso
  });
  return { code, codeExpires: new Date(Date.now() + CODE_TTL_MS), codeSentAt: new Date() };
}

// ---- Configuración del usuario (comercio / mecánico) ----

// Estado de la sección "Avisos por WhatsApp" del perfil.
// state: setup (sin número) | verify (código pendiente) | active (verificado) | baja (respondió BAJA)
export async function getWaConfig() {
  const s = await waSession(); if (!s) return null;
  const configured = waConfigured();
  const c = await prisma.waContact.findUnique({ where: { userId: s.id } });
  let rubros = [];
  if (s.role === 'STORE') {
    const cats = await prisma.storeCategory.findMany({ where: { storeId: s.id }, include: { category: { select: { name: true } } } }).catch(() => []);
    rubros = cats.map((x) => x.category.name);
  }
  if (!c || (!c.verifiedAt && !c.code)) return { configured, state: 'setup', rubros };
  if (!c.verifiedAt) return { configured, state: 'verify', rubros, phoneFmt: fmtArPhone(c.phone) };
  if (c.optedOutAt) return { configured, state: 'baja', rubros, phoneMasked: maskArPhone(c.phone), optedOutAt: c.optedOutAt.getTime() };
  return { configured, state: 'active', rubros, phoneMasked: maskArPhone(c.phone), verifiedAt: c.verifiedAt.getTime(), enabled: c.enabled };
}

// Guarda el número (nuevo o cambio) y manda el código de 6 dígitos.
export async function waStartVerify(phoneRaw) {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  if (!waConfigured()) return { error: 'Los avisos por WhatsApp todavía no están disponibles.' };
  const phone = normalizeArPhone(phoneRaw);
  if (!phone) return { error: 'Número inválido: 10 dígitos, área sin 0 y número sin 15.' };
  const prev = await prisma.waContact.findUnique({ where: { userId: s.id } });
  if (prev?.codeSentAt && Date.now() - prev.codeSentAt.getTime() < RESEND_MS && prev.phone === phone) {
    return { error: 'Esperá unos segundos antes de pedir otro código.' };
  }
  const sent = await sendCode({ phone, name: s.name || s.email, role: ROLE_WA[s.role] });
  await prisma.waContact.upsert({
    where: { userId: s.id },
    update: { phone, verifiedAt: null, optedOutAt: null, enabled: true, ...sent },
    create: { userId: s.id, phone, enabled: true, ...sent },
  });
  return { ok: true, sentTo: fmtArPhone(phone) };
}

// Reenvía el código al número pendiente.
export async function waResendCode() {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  const c = await prisma.waContact.findUnique({ where: { userId: s.id } });
  if (!c || c.verifiedAt) return { error: 'No hay una verificación pendiente.' };
  if (c.codeSentAt && Date.now() - c.codeSentAt.getTime() < RESEND_MS) return { error: 'Esperá unos segundos antes de pedir otro código.' };
  const sent = await sendCode({ phone: c.phone, name: s.name || s.email, role: ROLE_WA[s.role] });
  await prisma.waContact.update({ where: { userId: s.id }, data: sent });
  return { ok: true };
}

export async function waConfirmCode(codeRaw) {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  const code = String(codeRaw || '').replace(/\D/g, '');
  const c = await prisma.waContact.findUnique({ where: { userId: s.id } });
  if (!c || !c.code) return { error: 'No hay una verificación pendiente.' };
  if (c.codeExpires && c.codeExpires.getTime() < Date.now()) return { error: 'El código venció. Pedí uno nuevo.' };
  if (c.code !== code) return { error: 'Código incorrecto. Fijate en el último mensaje.' };
  await prisma.waContact.update({
    where: { userId: s.id },
    data: { verifiedAt: new Date(), enabled: true, optedOutAt: null, code: null, codeExpires: null },
  });
  return { ok: true };
}

// Toggle "Recibir avisos" (pausa propia, distinta de la BAJA).
export async function waSetEnabled(on) {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  await prisma.waContact.update({ where: { userId: s.id }, data: { enabled: !!on } }).catch(() => {});
  return { ok: true };
}

// Reactivar después de una BAJA (el número sigue verificado).
export async function waReactivate() {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  const c = await prisma.waContact.findUnique({ where: { userId: s.id } });
  if (!c?.verifiedAt) return { error: 'No hay un número verificado.' };
  await prisma.waContact.update({ where: { userId: s.id }, data: { optedOutAt: null, enabled: true } });
  return { ok: true };
}

// Borra el número (para cargar otro desde cero). El estado vuelve a "setup".
export async function waRemoveContact() {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  await prisma.waContact.delete({ where: { userId: s.id } }).catch(() => {});
  return { ok: true };
}

// "Enviarme un aviso de prueba" (respeta el kill switch: si está pausado, avisa).
export async function waSendTest() {
  const s = await waSession(); if (!s) return { error: 'No autorizado' };
  if (await waPaused()) return { error: 'Los avisos están pausados por el administrador.' };
  const c = await prisma.waContact.findUnique({ where: { userId: s.id }, include: { user: { select: { name: true, email: true, store: { select: { tradeName: true } } } } } });
  if (!c?.verifiedAt) return { error: 'Primero verificá tu número.' };
  await waNotify({
    event: 'prueba', params: {},
    targets: [{ phone: c.phone, name: c.user?.store?.tradeName || c.user?.name || c.user?.email, role: ROLE_WA[s.role], userId: s.id }],
  });
  return { ok: true };
}

// ---- Admin ----

async function adminSession() {
  const s = await getSession();
  if (!s || s.role !== 'ADMIN') return null;
  return s;
}

// Todo lo que necesita la pestaña "Guardia y canal".
export async function getWaAdminData() {
  const s = await adminSession(); if (!s) return null;
  const configured = waConfigured();
  const paused = await waPaused();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [sentToday, failedToday, failTotal, storesTotal, storesWa, guards, recent] = await Promise.all([
    prisma.waMessage.count({ where: { createdAt: { gte: today }, event: { notIn: ['verificacion'] } } }),
    prisma.waMessage.count({ where: { createdAt: { gte: today }, status: 'failed' } }),
    prisma.waMessage.count({ where: { status: 'failed' } }),
    prisma.storeProfile.count(),
    prisma.waContact.count({ where: { verifiedAt: { not: null }, enabled: true, optedOutAt: null, user: { role: 'STORE' } } }),
    prisma.waGuard.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.waMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 8, where: { event: { notIn: ['verificacion'] } } }),
  ]);
  // último aviso por número de guardia (para "Último aviso · evento")
  const lastByPhone = {};
  for (const g of guards) {
    const m = await prisma.waMessage.findFirst({ where: { toPhone: g.phone, event: { notIn: ['verificacion'] } }, orderBy: { createdAt: 'desc' } });
    if (m) lastByPhone[g.phone] = { at: m.createdAt.getTime(), event: m.event };
  }
  return {
    configured, testMode: waIsTest(), paused,
    kpis: { sentToday, failedToday, failTotal, storesTotal, storesWa },
    guards: guards.map((g) => ({
      id: g.id, name: g.name, phone: g.phone, phoneFmt: fmtArPhone(g.phone),
      verified: !!g.verifiedAt, active: g.active, events: g.events, last: lastByPhone[g.phone] || null,
    })),
    recent: recent.map(mapMsg),
  };
}

const mapMsg = (m) => ({
  id: m.id, at: m.createdAt.getTime(), dest: m.toName || fmtArPhone(m.toPhone), phoneFmt: fmtArPhone(m.toPhone),
  role: m.toRole || 'admin', event: m.event, refCode: m.refCode, refUrl: m.refUrl, body: m.body,
  status: m.status === 'queued' ? 'sent' : m.status, failReason: m.failReason, groupId: m.groupId,
});

// Pestaña "Mensajes": historial completo + respuestas + plantillas.
export async function getWaMessagesData() {
  const s = await adminSession(); if (!s) return null;
  const [messages, replies, uses] = await Promise.all([
    prisma.waMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.waReply.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.waMessage.groupBy({ by: ['event'], _count: { _all: true } }).catch(() => []),
  ]);
  const usesByEvent = Object.fromEntries(uses.map((u) => [u.event, u._count._all]));
  // estado real de las plantillas en Meta (si hay WABA id); si no, quedan como "pendiente"
  let metaStatus = {};
  if (process.env.WHATSAPP_WABA_ID && process.env.WHATSAPP_TOKEN && !waIsTest()) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_WABA_ID}/message_templates?fields=name,status&limit=100`, {
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) metaStatus = Object.fromEntries((data?.data || []).map((t) => [t.name, t.status]));
    } catch {}
  }
  const ST = { APPROVED: 'approved', PENDING: 'pending', PAUSED: 'paused', DISABLED: 'paused', REJECTED: 'rejected' };
  const templates = Object.entries(WA_TEMPLATES).map(([event, t]) => ({
    event, name: t.name, label: t.label,
    body: t.body(Object.fromEntries(t.params.map((p) => [p, `{{${p}}}`]))),
    status: waIsTest() ? 'approved' : (ST[metaStatus[t.name]] || 'pending'),
    uses: usesByEvent[event] || 0,
  }));
  return {
    messages: messages.map(mapMsg),
    replies: replies.map((r) => ({ id: r.id, at: r.createdAt.getTime(), from: r.fromName || fmtArPhone(r.fromPhone), phoneFmt: fmtArPhone(r.fromPhone), body: r.body, action: r.action })),
    templates,
  };
}

// Kill switch global.
export async function waSetPaused(on) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  await prisma.setting.upsert({ where: { key: 'waPaused' }, update: { value: on ? 'true' : 'false' }, create: { key: 'waPaused', value: on ? 'true' : 'false' } });
  return { ok: true };
}

// Alta / edición de número de guardia. Cambio de número => re-verificación.
export async function waSaveGuard({ id, name, phone: phoneRaw, events }) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  if (!waConfigured()) return { error: 'Primero configurá el canal de WhatsApp (docs/WHATSAPP.md).' };
  const phone = normalizeArPhone(phoneRaw);
  if (!String(name || '').trim()) return { error: 'Poné un nombre o etiqueta.' };
  if (!phone) return { error: 'Número inválido: 10 dígitos, área sin 0 y número sin 15.' };
  const evs = (events || []).filter((e) => EVENTS.includes(e));
  if (!evs.length) return { error: 'Elegí al menos un evento.' };
  if (id) {
    const g = await prisma.waGuard.findUnique({ where: { id } });
    if (!g) return { error: 'No existe ese número.' };
    const numChanged = g.phone !== phone;
    const sent = numChanged ? await sendCode({ phone, name: name.trim(), role: 'admin' }) : {};
    await prisma.waGuard.update({
      where: { id },
      data: { name: name.trim(), phone, events: evs, ...(numChanged ? { verifiedAt: null, active: false, ...sent } : {}) },
    });
    return { ok: true, reverify: numChanged };
  }
  const sent = await sendCode({ phone, name: name.trim(), role: 'admin' });
  const g = await prisma.waGuard.create({ data: { name: name.trim(), phone, events: evs, active: false, ...sent } });
  return { ok: true, id: g.id };
}

export async function waVerifyGuard(id, codeRaw) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  const code = String(codeRaw || '').replace(/\D/g, '');
  const g = await prisma.waGuard.findUnique({ where: { id } });
  if (!g?.code) return { error: 'No hay una verificación pendiente.' };
  if (g.codeExpires && g.codeExpires.getTime() < Date.now()) return { error: 'El código venció. Reenvialo.' };
  if (g.code !== code) return { error: 'Código incorrecto.' };
  await prisma.waGuard.update({ where: { id }, data: { verifiedAt: new Date(), active: true, code: null, codeExpires: null } });
  return { ok: true };
}

export async function waResendGuard(id) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  const g = await prisma.waGuard.findUnique({ where: { id } });
  if (!g || g.verifiedAt) return { error: 'No hay una verificación pendiente.' };
  if (g.codeSentAt && Date.now() - g.codeSentAt.getTime() < RESEND_MS) return { error: 'Esperá unos segundos antes de reenviar.' };
  const sent = await sendCode({ phone: g.phone, name: g.name, role: 'admin' });
  await prisma.waGuard.update({ where: { id }, data: sent });
  return { ok: true };
}

export async function waToggleGuard(id, on) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  const g = await prisma.waGuard.findUnique({ where: { id } });
  if (!g?.verifiedAt && on) return { error: 'Primero verificá el número.' };
  await prisma.waGuard.update({ where: { id }, data: { active: !!on } });
  return { ok: true };
}

export async function waSetGuardEvents(id, events) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  const evs = (events || []).filter((e) => EVENTS.includes(e));
  if (!evs.length) return { error: 'Tiene que recibir al menos un evento.' };
  await prisma.waGuard.update({ where: { id }, data: { events: evs } });
  return { ok: true };
}

export async function waDeleteGuard(id) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  await prisma.waGuard.delete({ where: { id } }).catch(() => {});
  return { ok: true };
}

// Reintenta un mensaje fallido (mismo destinatario, misma plantilla y parámetros).
export async function waRetryMessage(id) {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  const m = await prisma.waMessage.findUnique({ where: { id } });
  if (!m || m.status !== 'failed') return { error: 'Ese mensaje no está fallido.' };
  if (/bloque/i.test(m.failReason || '')) return { error: 'El destinatario nos tiene bloqueados: no se puede reintentar.' };
  if (await waPaused()) return { error: 'Los avisos están pausados.' };
  try {
    const { id: wamid } = await sendWaTemplate({ toPhone: m.toPhone, event: m.event, params: m.params || {} });
    await prisma.waMessage.update({ where: { id }, data: { waMessageId: wamid, status: 'sent', failReason: null, statusAt: new Date() } });
    return { ok: true };
  } catch (e) {
    await prisma.waMessage.update({ where: { id }, data: { failReason: e?.message || 'Error de envío', statusAt: new Date() } }).catch(() => {});
    return { error: e?.message || 'No se pudo reenviar.' };
  }
}

// "Recordarles": push a los comercios que todavía no configuraron WhatsApp.
export async function waRemindStores() {
  const s = await adminSession(); if (!s) return { error: 'No autorizado' };
  const stores = await prisma.user.findMany({ where: { role: 'STORE', status: 'ACTIVE', waContact: null }, select: { id: true } });
  await sendPushMany(stores.map((u) => u.id), {
    title: 'Activá los avisos por WhatsApp 📲',
    body: 'Enterate al instante cuando un mecánico pide un repuesto de tu rubro. Configuralo desde tu perfil.',
    url: '/comercio/perfil', tag: 'wa-recordatorio',
  }).catch(() => {});
  return { ok: true, count: stores.length };
}
