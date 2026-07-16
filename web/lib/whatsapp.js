// Avisos por WhatsApp (Meta Cloud API, server-only). No-op si faltan las credenciales
// (deploy seguro sin activar, igual que push.js). Fire-and-forget: los errores nunca
// rompen la acción que dispara el aviso — quedan en el log (WaMessage) para el admin.
//
// Env:
//  - WHATSAPP_TOKEN        token permanente de la app de Meta (System User)
//  - WHATSAPP_PHONE_ID     Phone Number ID del número del bot
//  - WHATSAPP_VERIFY_TOKEN string propio para el handshake del webhook
//  - WHATSAPP_APP_SECRET   (opcional) valida la firma X-Hub-Signature-256 del webhook
//  - WHATSAPP_WABA_ID      (opcional) id de la WhatsApp Business Account: estado real de plantillas
//  - WA_TEST_MODE          (opcional, staging/local) no llama a Meta: marca los mensajes como
//                          enviados para poder probar la UI y los E2E sin credenciales.
import { prisma } from '@/lib/db';

const WA_API = 'https://graph.facebook.com/v20.0';

export function waConfigured() {
  return !!((process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) || waIsTest());
}
export function waIsTest() {
  return !!process.env.WA_TEST_MODE;
}

// ---- Números argentinos ----
// Guardamos 10 dígitos (área sin 0 + número sin 15) y enviamos como 549<phone> (E.164 sin +).
export function waDigits(v) {
  return String(v || '').replace(/\D/g, '');
}
// null si el formato no sirve. Acepta el número ya normalizado o con 549/54 adelante.
export function normalizeArPhone(v) {
  let d = waDigits(v);
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  if (d.length !== 10 || d.startsWith('0') || d.startsWith('15')) return null;
  return d;
}
export function toWaId(phone) {
  return '549' + phone;
}
// +54 9 294 412 3456
export function fmtArPhone(phone) {
  const d = waDigits(phone);
  return `+54 9 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
// +54 9 294 •••• 823 (primeros 3 + últimos 3)
export function maskArPhone(phone) {
  const d = waDigits(phone);
  return `+54 9 ${d.slice(0, 3)} •••• ${d.slice(7)}`;
}

// ---- Plantillas ----
// Nombres de las plantillas en Meta (categoría utility, idioma es_AR) y su texto de referencia.
// El texto acá es el MISMO que se envía a aprobar en Meta; `body(p)` lo arma con los datos reales
// para guardarlo en el log del admin (Meta renderiza la plantilla por su cuenta).
export const WA_TEMPLATES = {
  solicitud: {
    name: 'rat_nueva_solicitud',
    label: 'Nueva solicitud',
    params: ['repuesto', 'vehiculo', 'zona', 'link'],
    body: (p) => `🔧 Nueva solicitud: ${p.repuesto} · ${p.vehiculo} · ${p.zona}. Entrá a cotizar → ${p.link} Respondé BAJA para dejar de recibir avisos.`,
  },
  cotizacion: {
    name: 'rat_nueva_cotizacion',
    label: 'Nueva cotización',
    params: ['comercio', 'monto', 'repuesto', 'link'],
    body: (p) => `💬 Nueva cotización: ${p.comercio} cotizó ${p.monto} tu pedido de ${p.repuesto}. Miralo → ${p.link}`,
  },
  pago: {
    name: 'rat_pago_acreditado',
    label: 'Pago acreditado',
    params: ['monto', 'repuesto', 'orden', 'link'],
    body: (p) => `💰 Pago acreditado: ${p.monto} · ${p.repuesto} · ${p.orden}. Coordiná la entrega → ${p.link}`,
  },
  mp: {
    name: 'rat_mp_vinculado',
    label: 'Comercio vinculó MP',
    params: ['comercio'],
    body: (p) => `🔗 ${p.comercio} vinculó Mercado Pago. Ya puede recibir pagos.`,
  },
  verificacion: {
    name: 'rat_codigo_verificacion',
    label: 'Código de verificación',
    params: ['codigo'],
    body: (p) => `Tu código de RepuestosAlToque es ${p.codigo}. Vence en 10 minutos.`,
  },
  prueba: {
    name: 'rat_aviso_prueba',
    label: 'Aviso de prueba',
    params: [],
    body: () => '✅ Esto es un aviso de prueba de RepuestosAlToque. Si lo recibiste, ¡quedó todo configurado!',
  },
};

// ---- Llamadas a la Cloud API ----
async function waPost(path, payload) {
  const res = await fetch(`${WA_API}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'Error de la API de WhatsApp.');
  return data;
}

// Envía UNA plantilla. Devuelve el id de Meta (wamid...) para seguir el estado por webhook.
export async function sendWaTemplate({ toPhone, event, params }) {
  if (waIsTest()) return { id: `test-${event}-${toPhone}-${Math.random().toString(36).slice(2, 8)}` };
  const tpl = WA_TEMPLATES[event];
  const components = tpl.params.length
    ? [{ type: 'body', parameters: tpl.params.map((k) => ({ type: 'text', text: String(params?.[k] ?? '') })) }]
    : undefined;
  const data = await waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaId(toPhone),
    type: 'template',
    template: { name: tpl.name, language: { code: 'es_AR' }, ...(components ? { components } : {}) },
  });
  return { id: data?.messages?.[0]?.id || null };
}

// Mensaje de texto libre: SOLO vale dentro de la ventana de 24 hs que abre el usuario al
// escribirnos (lo usamos para la auto-respuesta del webhook).
export async function sendWaText({ toPhone, body }) {
  if (waIsTest()) return { id: null };
  const data = await waPost(`${process.env.WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp',
    to: toWaId(toPhone),
    type: 'text',
    text: { body, preview_url: false },
  });
  return { id: data?.messages?.[0]?.id || null };
}

// ---- Kill switch global (Setting waPaused) ----
export async function waPaused() {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'waPaused' } });
    return s?.value === 'true';
  } catch { return false; }
}

// ---- Envío con log ----
// Envía la plantilla a cada destinatario y deja UNA fila de WaMessage por cada uno.
// targets: [{ phone, name, role, userId }]. Con el canal pausado o sin configurar
// no se envía nada — y tampoco se loguea ruido.
export async function waNotify({ event, params, targets, refCode, refUrl, groupId, skipPauseCheck = false }) {
  if (!waConfigured() || !targets?.length) return;
  if (!skipPauseCheck && (await waPaused())) return;
  const tpl = WA_TEMPLATES[event];
  const body = tpl.body(params || {});
  const gid = groupId || `${event}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await Promise.all(targets.map(async (t) => {
    const row = await prisma.waMessage.create({
      data: { toPhone: t.phone, toName: t.name || null, toRole: t.role || null, userId: t.userId || null, event, refCode: refCode || null, refUrl: refUrl || null, body, params: params || {}, groupId: gid },
    }).catch(() => null);
    try {
      const { id } = await sendWaTemplate({ toPhone: t.phone, event, params });
      if (row) await prisma.waMessage.update({ where: { id: row.id }, data: { waMessageId: id, status: 'sent', statusAt: new Date() } }).catch(() => {});
    } catch (e) {
      if (row) await prisma.waMessage.update({ where: { id: row.id }, data: { status: 'failed', failReason: e?.message || 'Error de envío', statusAt: new Date() } }).catch(() => {});
    }
  }));
}

// Guardias que reciben este evento (verificados y activos).
export async function waGuardTargets(event) {
  try {
    const guards = await prisma.waGuard.findMany({ where: { active: true, verifiedAt: { not: null }, events: { has: event } } });
    return guards.map((g) => ({ phone: g.phone, name: g.name, role: 'admin' }));
  } catch { return []; }
}

// Contactos verificados, con avisos activos y sin BAJA, de una lista de usuarios.
export async function waContactTargets(userIds, role) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return [];
  try {
    const contacts = await prisma.waContact.findMany({
      where: { userId: { in: ids }, enabled: true, verifiedAt: { not: null }, optedOutAt: null },
      include: { user: { select: { name: true, email: true, store: { select: { tradeName: true } } } } },
    });
    return contacts.map((c) => ({ phone: c.phone, name: c.user?.store?.tradeName || c.user?.name || c.user?.email, role, userId: c.userId }));
  } catch { return []; }
}

// ---- Avisos de la plataforma (helpers de alto nivel, fire-and-forget) ----
const appUrl = () => (process.env.APP_URL || 'https://repuestosaltoque.com.ar').replace(/\/+$/, '');

// Nueva solicitud publicada -> comercios del rubro + guardia.
export async function waNotifyNewRequest({ storeIds, repuesto, vehiculo, zona, refCode }) {
  if (!waConfigured()) return;
  const params = { repuesto, vehiculo, zona, link: `${appUrl()}/comercio` };
  const targets = [...(await waContactTargets(storeIds, 'comercio')), ...(await waGuardTargets('solicitud'))];
  await waNotify({ event: 'solicitud', params, targets, refCode, refUrl: '/comercio' });
}

// Nueva cotización -> mecánico dueño del pedido + guardia.
export async function waNotifyNewQuote({ mechanicId, comercio, monto, repuesto, refCode }) {
  if (!waConfigured()) return;
  const params = { comercio, monto, repuesto, link: `${appUrl()}/mecanico` };
  const targets = [...(await waContactTargets([mechanicId], 'mecanico')), ...(await waGuardTargets('cotizacion'))];
  await waNotify({ event: 'cotizacion', params, targets, refCode, refUrl: '/mecanico' });
}

// Pago acreditado -> comercio(s) vendedores + guardia.
export async function waNotifyPaid({ storeIds, monto, repuesto, orden }) {
  if (!waConfigured()) return;
  const params = { monto, repuesto, orden, link: `${appUrl()}/comercio` };
  const targets = [...(await waContactTargets(storeIds, 'comercio')), ...(await waGuardTargets('pago'))];
  await waNotify({ event: 'pago', params, targets, refCode: orden, refUrl: '/comercio' });
}

// Un comercio vinculó su Mercado Pago -> guardia.
export async function waNotifyMpLinked({ comercio }) {
  if (!waConfigured()) return;
  await waNotify({ event: 'mp', params: { comercio }, targets: await waGuardTargets('mp') });
}

// ---- Respuestas entrantes (webhook) ----
// Procesa un texto que alguien le mandó al bot. BAJA (solo o con signos) => opt-out del
// contacto con ese número; cualquier otra cosa => auto-respuesta. Deja el registro en WaReply.
export async function processInboundText({ fromPhone, fromName, body }) {
  const phone = normalizeArPhone(fromPhone) || waDigits(fromPhone);
  const isBaja = /^\s*baja\s*[.!]*\s*$/i.test(body || '');
  let action = 'auto';
  if (isBaja) {
    action = 'baja';
    await prisma.waContact.updateMany({ where: { phone }, data: { enabled: false, optedOutAt: new Date() } }).catch(() => {});
  } else {
    await sendWaText({ toPhone: phone, body: 'Este es un canal de avisos automáticos de RepuestosAlToque. Para gestionar tus pedidos entrá a ' + appUrl() + ' — y si querés dejar de recibir avisos, respondé BAJA.' }).catch(() => {});
  }
  // nombre legible: contacto/guardia conocido > profile name de WhatsApp
  let name = fromName || null;
  try {
    const c = await prisma.waContact.findFirst({ where: { phone }, include: { user: { select: { name: true, email: true, store: { select: { tradeName: true } } } } } });
    if (c) name = c.user?.store?.tradeName || c.user?.name || c.user?.email || name;
    else {
      const g = await prisma.waGuard.findFirst({ where: { phone } });
      if (g) name = g.name;
    }
  } catch {}
  await prisma.waReply.create({ data: { fromPhone: phone, fromName: name, body: String(body || '').slice(0, 500), action } }).catch(() => {});
  return { action };
}

// ---- Estados del webhook (sent/delivered/read/failed) ----
const FAIL_ES = {
  131026: 'El número no tiene WhatsApp',
  131047: 'Pasaron más de 24 hs desde el último mensaje del usuario',
  131048: 'Límite de envíos alcanzado (calidad del número)',
  131051: 'Tipo de mensaje no soportado',
  132000: 'La cantidad de parámetros no coincide con la plantilla',
  132001: 'La plantilla no existe o no está aprobada',
  132015: 'La plantilla está pausada por Meta',
  100: 'Número inválido',
  368: 'El destinatario nos bloqueó',
};
const STATUS_ORDER = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 9 };

export async function applyStatusUpdate({ waMessageId, status, errors, timestamp }) {
  if (!waMessageId || !status) return;
  try {
    const row = await prisma.waMessage.findUnique({ where: { waMessageId } });
    if (!row) return;
    // Meta puede reenviar estados fuera de orden: nunca retroceder (p. ej. read -> delivered)
    if (STATUS_ORDER[status] <= STATUS_ORDER[row.status] && status !== 'failed') return;
    const failReason = status === 'failed'
      ? (FAIL_ES[errors?.[0]?.code] || errors?.[0]?.title || 'Error de entrega')
      : null;
    await prisma.waMessage.update({
      where: { waMessageId },
      data: { status, failReason, statusAt: timestamp ? new Date(Number(timestamp) * 1000) : new Date() },
    });
  } catch {}
}
