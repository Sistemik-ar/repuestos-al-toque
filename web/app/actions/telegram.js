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

// Busca el chat_id de quien le haya escrito al bot recién (Jorge manda /start y tocamos Detectar).
// getUpdates solo funciona si el bot NO tiene webhook configurado, que es nuestro caso.
export async function detectTelegramChat() {
  if (!(await requireAdmin())) return { error: 'No autorizado' };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { error: 'Falta TELEGRAM_BOT_TOKEN en el servidor.' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) return { error: data?.description || 'Telegram no respondió.' };
    const chats = new Map();
    for (const u of data.result || []) {
      const c = u?.message?.chat || u?.channel_post?.chat;
      if (c?.id != null) chats.set(String(c.id), [c.first_name, c.last_name].filter(Boolean).join(' ') || c.title || c.username || 'Chat');
    }
    const found = [...chats].map(([id, name]) => ({ id, name })).reverse();
    if (found.length === 0) return { error: 'Nadie le escribió al bot todavía. Abrí el bot en Telegram, mandá /start y probá de nuevo.' };
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
