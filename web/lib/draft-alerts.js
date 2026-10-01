// Borradores olvidados. En producción, varios mecánicos cargaban el repuesto, creían que el pedido
// ya estaba enviado y nunca tocaban "Solicitar presupuesto": los comercios no lo veían, no llegaba
// ninguna cotización y el trabajo terminaba cancelado. A los 30 min sin tocar el borrador avisamos
// al mecánico (push) y al admin (Telegram, con el teléfono para llamarlo). Una sola vez por trabajo.
//
// Corre dentro del barrido perezoso de data.js (sin cron). El "ya avisado" se guarda en audit_logs
// para no tocar el trabajo: cambiarle el updatedAt reiniciaría el reloj de 24hs del borrador.
import { prisma } from '@/lib/db';
import { sendPush } from '@/lib/push';
import { tgNotifyStaleDraft } from '@/lib/telegram';

export const STALE_DRAFT_MS = 30 * 60 * 1000;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // pasadas las 24hs el barrido lo cancela: ya no tiene sentido avisar
export const ACTION = 'DRAFT_STALE_ALERT';

export async function alertStaleDrafts(now = new Date()) {
  const drafts = await prisma.job.findMany({
    where: { status: 'DRAFT', updatedAt: { lt: new Date(now - STALE_DRAFT_MS), gt: new Date(now - DRAFT_TTL_MS) } },
    select: {
      id: true, code: true, plate: true, brand: true, model: true, year: true, mechanicId: true, updatedAt: true,
      requests: { where: { status: { not: 'CANCELLED' } }, select: { description: true, category: { select: { name: true } } } },
    },
    take: 20,
  });
  if (!drafts.length) return { sent: 0 };

  const avisados = await prisma.auditLog.findMany({ where: { action: ACTION, entity: 'job', entityId: { in: drafts.map((d) => d.id) } }, select: { entityId: true } });
  const ya = new Set(avisados.map((a) => a.entityId));
  // un borrador sin ítems vivos no es un pedido olvidado (lo vació el mecánico)
  const pendientes = drafts.filter((d) => !ya.has(d.id) && d.requests.length > 0);
  if (!pendientes.length) return { sent: 0 };

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(pendientes.map((d) => d.mechanicId))] } },
    select: { id: true, name: true, email: true, phone: true, whatsapp: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  let sent = 0;
  for (const d of pendientes) {
    // se marca ANTES de avisar: si el aviso falla no se reintenta en cada barrido (es best-effort)
    try {
      await prisma.auditLog.create({ data: { action: ACTION, entity: 'job', entityId: d.id, payload: { code: d.code } } });
    } catch { continue; }
    const u = byId.get(d.mechanicId);
    const ref = d.code ? `#${d.code}` : '';
    await sendPush(d.mechanicId, {
      title: 'Tu pedido todavía no se envió',
      body: `${ref} — los comercios no lo ven hasta que toques "Solicitar presupuesto".`,
      url: `/mecanico/trabajo?id=${d.id}`,
      tag: 'borrador-' + d.id,
    }).catch(() => {});
    await tgNotifyStaleDraft({
      code: d.code, plate: d.plate, brand: d.brand, model: d.model, year: d.year,
      items: d.requests.map((r) => r.description || r.category?.name).filter(Boolean),
      mechanicName: u?.name || u?.email, phone: u?.whatsapp || u?.phone,
      minutes: Math.round((now - d.updatedAt) / 60000),
    }).catch(() => {});
    sent++;
  }
  return { sent };
}
