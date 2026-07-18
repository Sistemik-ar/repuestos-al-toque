// Avisos por Telegram al admin (server-only). Es un PUENTE temporal hasta que esté el bot de
// WhatsApp: el aviso le llega a Jorge por Telegram y él lo reenvía por WhatsApp copiando y pegando.
// Por eso el cuerpo del mensaje va dentro de un bloque <pre>: en Telegram se copia de un toque.
//
// Bot de BotFather: TELEGRAM_BOT_TOKEN en las variables de entorno. El destinatario (chat_id) se
// configura desde el panel de admin, no por env: así se cambia de número sin redeploy.
// No-op si falta el token o el chat: se puede deployar sin activar nada.
import { prisma } from '@/lib/db';

const TG_API = 'https://api.telegram.org';

// claves en la tabla Setting (mismo lugar que comisión/recargo, sin tabla nueva)
const K_CHAT = 'tgChatId';
const K_ENABLED = 'tgEnabled';

export function tgConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

export async function getTelegramConfig() {
  try {
    const rows = await prisma.setting.findMany({ where: { key: { in: [K_CHAT, K_ENABLED] } } });
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { configured: tgConfigured(), chatId: m[K_CHAT] || '', enabled: m[K_ENABLED] === 'true' };
  } catch {
    return { configured: tgConfigured(), chatId: '', enabled: false };
  }
}

export async function setTelegramConfig({ chatId, enabled }) {
  const entries = [
    [K_CHAT, String(chatId || '').trim()],
    [K_ENABLED, enabled ? 'true' : 'false'],
  ];
  for (const [key, value] of entries) {
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
}

// Escape de HTML: la patente/marca/modelo las escribe el mecánico y viajan con parse_mode=HTML.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Envío crudo. Devuelve { ok } — nunca lanza: un aviso caído no puede romper la acción que lo llama.
export async function sendTelegram(text, { chatId } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'Falta TELEGRAM_BOT_TOKEN en el servidor.' };
  let to = chatId;
  if (!to) {
    const cfg = await getTelegramConfig();
    if (!cfg.enabled || !cfg.chatId) return { ok: false, error: 'Los avisos por Telegram están apagados o sin destinatario.' };
    to = cfg.chatId;
  }
  // En STAGING (MP_TEST_ACCESS_TOKEN seteado; ausente en producción) marcamos el aviso como PRUEBAS,
  // para que un mensaje de staging no se confunda con uno real y se reenvíe a un comercio.
  const body = process.env.MP_TEST_ACCESS_TOKEN ? '🧪 <b>PRUEBAS</b>\n' + text : text;
  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: to, text: body, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) return { ok: false, error: data?.description || 'Telegram rechazó el mensaje.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'No se pudo contactar a Telegram.' };
  }
}

function appUrl() {
  return (process.env.APP_URL || 'https://repuestosaltoque.com.ar').replace(/\/+$/, '');
}

// Aviso de trabajo publicado. El bloque <pre> es lo que Jorge copia y manda por WhatsApp a los
// comercios; el resto (mecánico, zona) es contexto para él y NO va en el reenvío.
export async function tgNotifyNewJob({ code, plate, brand, model, year, repuesto, mechanicName, zona }) {
  const cfg = await getTelegramConfig();
  if (!cfg.configured || !cfg.enabled || !cfg.chatId) return { ok: false, skipped: true };
  const vehiculo = [brand, model, year].filter(Boolean).join(' ') || 'Vehículo sin datos';
  const ref = code ? `#${code}` : '';
  const copia = [
    '¡Hola! Entró un pedido nuevo para cotizar 🔧',
    '',
    `Vehículo: ${vehiculo}`,
    `Patente: ${plate || '—'}`,
    `Repuesto: ${repuesto || 'A confirmar'}`,
    '',
    `Entrá a RepuestosAlToque y cargá tu precio: ${appUrl()}/comercio`,
  ].join('\n');
  const text = [
    `🔧 <b>Pedido nuevo para cotizar</b> ${esc(ref)}`,
    `<pre>${esc(copia)}</pre>`,
    `<i>Mecánico: ${esc(mechanicName || '—')} · Zona: ${esc(zona || '—')}</i>`,
  ].join('\n');
  return sendTelegram(text, { chatId: cfg.chatId });
}

// Alerta: entró un pago de un trabajo que ya estaba cancelado. No se generó ninguna orden y la
// plata quedó en Mercado Pago -> hay que devolverla a mano. Ver lib/order-guards.js.
export async function tgNotifyOrphanPayment({ ref, code, paidAmount }) {
  const cfg = await getTelegramConfig();
  if (!cfg.configured || !cfg.enabled || !cfg.chatId) return { ok: false, skipped: true };
  const monto = paidAmount != null && Number.isFinite(Number(paidAmount))
    ? '$' + Math.round(Number(paidAmount)).toLocaleString('es-AR')
    : 'monto desconocido';
  const text = [
    '⚠️ <b>Pagaron un pedido CANCELADO</b>',
    '',
    `Pedido: ${esc(code ? '#' + code : ref || '—')}`,
    `Monto: ${esc(monto)}`,
    '',
    'No se generó ninguna orden y nadie va a despachar la pieza.',
    'Devolvé la plata desde el panel de Mercado Pago.',
  ].join('\n');
  return sendTelegram(text, { chatId: cfg.chatId });
}
