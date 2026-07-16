// Webhook de la Cloud API de WhatsApp (Meta).
// - GET: handshake de verificación al configurar el webhook en la app de Meta.
// - POST: estados de los mensajes enviados (sent/delivered/read/failed) y mensajes
//   entrantes (respuestas al bot: BAJA => opt-out, resto => auto-respuesta).
// Siempre respondemos 200 rápido: si Meta no recibe 200, reintenta y termina
// deshabilitando el webhook.
import crypto from 'crypto';
import { applyStatusUpdate, processInboundText } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req) {
  const raw = await req.text();
  // firma opcional: con WHATSAPP_APP_SECRET seteado, descartamos payloads que no vengan de Meta
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const sig = req.headers.get('x-hub-signature-256') || '';
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return new Response('bad signature', { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return Response.json({ received: true }); }

  try {
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const v = change?.value;
        if (!v) continue;
        // estados de mensajes que mandamos nosotros
        for (const st of v.statuses || []) {
          await applyStatusUpdate({ waMessageId: st.id, status: st.status, errors: st.errors, timestamp: st.timestamp });
        }
        // mensajes entrantes (respuestas de la gente)
        for (const msg of v.messages || []) {
          if (msg.type !== 'text') continue;
          const name = v.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name || null;
          await processInboundText({ fromPhone: msg.from, fromName: name, body: msg.text?.body });
        }
      }
    }
  } catch {} // nunca romper: Meta reintentaría en loop
  return Response.json({ received: true });
}
