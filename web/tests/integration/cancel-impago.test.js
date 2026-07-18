// Cancelación de pedidos impagos, contra la base REAL (Postgres local).
// Lo que se prueba de punta a punta es el circuito de seguridad completo:
// el admin cancela -> se vence el link -> y si el pago llega igual, NO se confirma nada.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('@/lib/session', () => ({ getSession: vi.fn(), invalidateStatusCache: vi.fn() }));
// no le pegamos a la API de MP en cada corrida: eso ya está verificado en tests/unit/mp-link.test.js
vi.mock('@/lib/mercadopago', async (importOriginal) => ({
  ...(await importOriginal()),
  deactivatePaymentLink: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/push', () => ({
  sendPush: vi.fn().mockResolvedValue(undefined),
  sendPushMany: vi.fn().mockResolvedValue(undefined),
  notifyDeliveryNewTrip: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/session';
import { deactivatePaymentLink } from '@/lib/mercadopago';
import { sendPush } from '@/lib/push';
import { adminCancelUnpaidRequest } from '@/app/actions/admin-jobs';
import { confirmPaidByRef } from '@/lib/orders';

const SUF = `it${Date.now()}`;
const LINK = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1234-abcd';
let admin, mecanico, comercio;

// Un trabajo con link de pago generado y dos ítems elegidos (el escenario que motiva la feature).
async function crearTrabajoImpago({ status = 'CLOSED', paymentLink = LINK, items = 2 } = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  const job = await prisma.job.create({
    data: { code: `J-${n}`, mechanicId: mecanico.id, plate: 'AB123CD', brand: 'Ford', model: 'Ranger', year: 2018, status, paymentLink, selectedAt: new Date() },
  });
  const reqs = [];
  for (let i = 0; i < items; i++) {
    const r = await prisma.request.create({
      data: { code: `R-${n}-${i}`, mechanicId: mecanico.id, jobId: job.id, status: 'CLOSED', description: `Repuesto ${i}` },
    });
    await prisma.requestQuote.create({ data: { requestId: r.id, storeId: comercio.id, alias: 'Comercio A', price: 50000, status: 'SELECTED' } });
    reqs.push(r);
  }
  return { job, reqs };
}

beforeAll(async () => {
  const mk = (role, email) => prisma.user.create({ data: { email, role, status: 'ACTIVE', name: `${role} ${SUF}` } });
  admin = await mk('ADMIN', `admin-${SUF}@test.local`);
  mecanico = await mk('MECHANIC', `mec-${SUF}@test.local`);
  comercio = await mk('STORE', `store-${SUF}@test.local`);
});

afterAll(async () => {
  // limpieza: la base es descartable pero no la dejamos sucia para la próxima corrida
  const ids = [admin.id, mecanico.id, comercio.id];
  await prisma.order.deleteMany({ where: { mechanicId: { in: ids } } });
  await prisma.requestQuote.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.request.deleteMany({ where: { mechanicId: { in: ids } } });
  await prisma.job.deleteMany({ where: { mechanicId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
  deactivatePaymentLink.mockResolvedValue(true);
  getSession.mockResolvedValue({ id: admin.id, role: 'ADMIN' });
});

describe('adminCancelUnpaidRequest', () => {
  it('cancela el trabajo COMPLETO y vence el link de Mercado Pago', async () => {
    const { job, reqs } = await crearTrabajoImpago();

    const res = await adminCancelUnpaidRequest(reqs[0].id);
    expect(res).toMatchObject({ ok: true, items: 2, hadLink: true, linkDisabled: true });

    // el link se dio de baja con el link guardado del trabajo
    expect(deactivatePaymentLink).toHaveBeenCalledWith(LINK);

    // el trabajo entero quedó cancelado, no solo el ítem sobre el que se hizo clic
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CANCELLED');
    const estados = await prisma.request.findMany({ where: { jobId: job.id }, select: { status: true } });
    expect(estados.map((r) => r.status)).toEqual(['CANCELLED', 'CANCELLED']);

    // y al mecánico le avisamos: tiene el link abierto en el teléfono
    expect(sendPush).toHaveBeenCalledWith(mecanico.id, expect.objectContaining({ url: '/mecanico' }));
  });

  it('cancela igual si Mercado Pago rechaza la baja del link, y lo reporta', async () => {
    deactivatePaymentLink.mockResolvedValue(false);
    const { job, reqs } = await crearTrabajoImpago();

    const res = await adminCancelUnpaidRequest(reqs[0].id);
    expect(res).toMatchObject({ ok: true, hadLink: true, linkDisabled: false });
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CANCELLED');
  });

  it('no llama a MP si el trabajo nunca generó link', async () => {
    const { reqs } = await crearTrabajoImpago({ status: 'OPEN', paymentLink: null });
    const res = await adminCancelUnpaidRequest(reqs[0].id);
    expect(res).toMatchObject({ ok: true, hadLink: false, linkDisabled: null });
    expect(deactivatePaymentLink).not.toHaveBeenCalled();
  });

  it('se niega a cancelar algo ya pagado', async () => {
    const { job, reqs } = await crearTrabajoImpago();
    await prisma.request.update({ where: { id: reqs[0].id }, data: { status: 'PAID' } });

    expect(await adminCancelUnpaidRequest(reqs[0].id)).toEqual({ error: 'Este pedido ya fue pagado: no se puede cancelar' });
    // nada se tocó
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CLOSED');
    expect(deactivatePaymentLink).not.toHaveBeenCalled();
  });

  it('se niega si el trabajo ya está pagado aunque el ítem no lo esté', async () => {
    const { reqs, job } = await crearTrabajoImpago();
    await prisma.job.update({ where: { id: job.id }, data: { status: 'PAID' } });
    expect(await adminCancelUnpaidRequest(reqs[0].id)).toEqual({ error: 'El trabajo ya fue pagado: no se puede cancelar' });
  });

  it('rechaza a quien no sea admin', async () => {
    const { reqs, job } = await crearTrabajoImpago();
    getSession.mockResolvedValue({ id: mecanico.id, role: 'MECHANIC' });
    expect(await adminCancelUnpaidRequest(reqs[0].id)).toEqual({ error: 'No autorizado' });

    getSession.mockResolvedValue(null);
    expect(await adminCancelUnpaidRequest(reqs[0].id)).toEqual({ error: 'No autorizado' });
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CLOSED');
  });

  it('cancela un pedido suelto (sin trabajo, flujo viejo)', async () => {
    const n = Math.random().toString(36).slice(2, 8);
    const r = await prisma.request.create({ data: { code: `R-solo-${n}`, mechanicId: mecanico.id, status: 'QUOTED', description: 'Pedido sin trabajo' } });

    const res = await adminCancelUnpaidRequest(r.id);
    expect(res).toMatchObject({ ok: true, items: 1, hadLink: false });
    expect((await prisma.request.findUnique({ where: { id: r.id } })).status).toBe('CANCELLED');
    expect(deactivatePaymentLink).not.toHaveBeenCalled();
  });

  it('avisa si el pedido no existe o ya estaba cancelado', async () => {
    expect(await adminCancelUnpaidRequest('no-existe')).toEqual({ error: 'El pedido no existe' });
    const { reqs } = await crearTrabajoImpago();
    await adminCancelUnpaidRequest(reqs[0].id);
    expect(await adminCancelUnpaidRequest(reqs[1].id)).toEqual({ error: 'Este pedido ya estaba cancelado' });
  });
});

// El agujero que motivó toda la feature: el link de MP vive fuera de nuestra base. Si la baja
// del link falla y el mecánico paga igual, la confirmación NO puede dar el trabajo por pagado.
describe('pago que llega DESPUÉS de la cancelación', () => {
  it('no crea ninguna orden ni marca el trabajo como pagado', async () => {
    deactivatePaymentLink.mockResolvedValue(false); // MP no pudo vencer el link: queda vivo
    const { job, reqs } = await crearTrabajoImpago();
    await adminCancelUnpaidRequest(reqs[0].id);

    // ...y el mecánico paga el link que quedó vivo
    const confirmado = await confirmPaidByRef(`job::${job.id}`, 120000);

    expect(confirmado).toBe(false);
    expect(await prisma.order.count({ where: { requestId: { in: reqs.map((r) => r.id) } } })).toBe(0);
    expect((await prisma.job.findUnique({ where: { id: job.id } })).status).toBe('CANCELLED');
  });

  it('sin el corte, ese mismo pago habría dado "pagado" con cero ítems', async () => {
    // Prueba de que el peligro es real y no teórico: con el trabajo en CLOSED (como si nadie
    // hubiera cancelado) pero todos los ítems cancelados, el plan queda vacío y el total en 0.
    const { job, reqs } = await crearTrabajoImpago();
    await prisma.request.updateMany({ where: { jobId: job.id }, data: { status: 'CANCELLED' } });

    const { jobChargePlan } = await import('@/lib/orders');
    const plan = await jobChargePlan(job.id);
    expect(plan.items).toHaveLength(0);
    expect(plan.totals.total).toBe(0); // <- un pago de $120.000 "cubriría" este total

    // el guard es lo único que lo frena
    await prisma.job.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
    expect(await confirmPaidByRef(`job::${job.id}`, 120000)).toBe(false);
    expect(await prisma.order.count({ where: { requestId: { in: reqs.map((r) => r.id) } } })).toBe(0);
  });
});
