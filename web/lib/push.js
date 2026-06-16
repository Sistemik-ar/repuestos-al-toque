// Envío de Web Push (server-only). No-op si no están las claves VAPID (deploy seguro sin activar).
// Fire-and-forget: los errores nunca rompen la acción que lo llama.
import webpush from 'web-push';
import { prisma } from '@/lib/db';

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@repuestosaltoque.com.ar';
const configured = !!(PUB && PRIV);
if (configured) {
  try { webpush.setVapidDetails(SUBJECT, PUB, PRIV); } catch {}
}

// Envía una push a TODOS los dispositivos de un usuario.
export async function sendPush(userId, payload) {
  if (!configured || !userId) return;
  let subs;
  try { subs = await prisma.pushSubscription.findMany({ where: { userId } }); } catch { return; }
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
    } catch (e) {
      // 404/410 = suscripción vencida/cancelada -> la borramos
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
      }
    }
  }));
}

// Envía a varios usuarios (ej: todos los repartidores habilitados).
export async function sendPushMany(userIds, payload) {
  if (!configured) return;
  await Promise.all([...new Set((userIds || []).filter(Boolean))].map((id) => sendPush(id, payload)));
}

// Avisa a TODOS los repartidores habilitados que hay un viaje nuevo para tomar.
export async function notifyDeliveryNewTrip() {
  if (!configured) return;
  let couriers;
  try { couriers = await prisma.deliveryProfile.findMany({ where: { docsOk: true }, select: { userId: true } }); } catch { return; }
  await sendPushMany(couriers.map((c) => c.userId), {
    title: 'Nuevo viaje disponible 🛵',
    body: 'Hay un pedido pagado esperando flete. Tomalo desde tu panel.',
    url: '/repartidor', tag: 'nuevo-viaje',
  });
}
