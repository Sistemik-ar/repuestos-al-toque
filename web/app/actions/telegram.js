'use server';
// Backoffice de los avisos por Telegram (ver lib/telegram.js). Solo admin.
import { getSession } from '@/lib/session';
import { getTelegramConfig, setTelegramConfig, sendTelegram, tgConfigured } from '@/lib/telegram';

async function requireAdmin() {
  const s = await getSession();
  return s && s.role === 'ADMIN' ? s : null;
}

export async function getTelegramSettings() {
  if (!(await requireAdmin())) return { error: 'No autorizado' };
  return getTelegramConfig();
}

export async function saveTelegramSettings({ chatId, enabled }) {
  if (!(await requireAdmin())) return { error: 'No autorizado' };
  const id = String(chatId || '').trim();
  // chat_id de Telegram: entero (negativo si es un grupo). Si viene basura, mejor avisar acá
  // que descubrirlo cuando no llegue el aviso de un pedido real.
  if (enabled && !/^-?\d+$/.test(id)) return { error: 'El chat de Telegram tiene que ser un número (usá "Detectar").' };
  await setTelegramConfig({ chatId: id, enabled: !!enabled });
  return { ok: true };
}

// Nombre legible de un chat: los grupos traen `title`, las personas `first_name`/`last_name`.
function chatLabel(c) {
  const persona = [c.first_name, c.last_name].filter(Boolean).join(' ');
  const nombre = c.title || persona || c.username || 'Chat';
  return c.type === 'group' || c.type === 'supergroup' ? `${nombre} (grupo)` : nombre;
}

// Busca el chat donde mandar los avisos entre lo último que vio el bot.
// Sirven tanto el /start de una persona como el alta del bot en un grupo: ese evento llega
// como `my_chat_member`, así que agregarlo al grupo alcanza —no hace falta escribir adentro—.
// Importa porque en los grupos el modo privacidad viene activado: el bot no recibe los mensajes
// comunes, solo los comandos, y sin `my_chat_member` un grupo recién creado quedaría invisible.
// getUpdates solo funciona si el bot NO tiene webhook configurado, que es nuestro caso.
export async function detectTelegramChat() {
  if (!(await requireAdmin())) return { error: 'No autorizado' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { error: 'Falta TELEGRAM_BOT_TOKEN en el servidor.' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) return { error: data?.description || 'Telegram no respondió.' };
    const chats = new Map();
    for (const u of data.result || []) {
      // cualquier update trae el chat donde ocurrió; no nos importa de qué tipo sea
      for (const ev of Object.values(u || {})) {
        const c = ev?.chat;
        if (c?.id != null) chats.set(String(c.id), chatLabel(c));
      }
    }
    const found = [...chats].map(([id, name]) => ({ id, name })).reverse();
    if (found.length === 0) {
      return { error: 'El bot no vio ninguna conversación todavía. Mandale /start desde Telegram, o agregalo al grupo, y probá de nuevo.' };
    }
    return { ok: true, chats: found };
  } catch (e) {
    return { error: e?.message || 'No se pudo contactar a Telegram.' };
  }
}

// Manda un mensaje de prueba al chat que está por guardarse (o al guardado, si no viene ninguno).
export async function sendTelegramTest(chatId) {
  if (!(await requireAdmin())) return { error: 'No autorizado' };
  if (!tgConfigured()) return { error: 'Falta TELEGRAM_BOT_TOKEN en el servidor.' };
  const to = String(chatId || '').trim();
  const res = await sendTelegram(
    '✅ <b>Prueba de RepuestosAlToque</b>\nSi ves este mensaje, los avisos de pedidos nuevos van a llegar acá.',
    to ? { chatId: to } : undefined,
  );
  return res.ok ? { ok: true } : { error: res.error || 'No se pudo enviar.' };
}
