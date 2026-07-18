import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    job: { findUnique: vi.fn(), update: vi.fn() },
    request: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({}) },
    requestQuote: { findUnique: vi.fn(), update: vi.fn() },
    storeProfile: { findUnique: vi.fn() },
    mechanicProfile: { findUnique: vi.fn() },
    zone: { findMany: vi.fn().mockResolvedValue([]) },
    shippingTariff: { findMany: vi.fn().mockResolvedValue([]) },
    setting: { findMany: vi.fn().mockResolvedValue([]) },
    order: { upsert: vi.fn() },
  },
}));
vi.mock('@/lib/telegram', () => ({ tgNotifyOrphanPayment: vi.fn().mockResolvedValue({ ok: true }) }));

import { prisma } from '@/lib/db';
import { tgNotifyOrphanPayment } from '@/lib/telegram';
import { jobIsChargeable, requestIsChargeable, reportOrphanPayment } from '@/lib/order-guards';
import { confirmPaidByRef } from '@/lib/orders';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('jobIsChargeable', () => {
  it('bloquea un trabajo cancelado', async () => {
    prisma.job.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    expect(await jobIsChargeable('j1')).toBe(false);
  });
  it('deja pasar los estados vivos', async () => {
    for (const status of ['DRAFT', 'OPEN', 'CLOSED', 'PAID', 'DONE']) {
      prisma.job.findUnique.mockResolvedValue({ status });
      expect(await jobIsChargeable('j1')).toBe(true);
    }
  });
  it('ante un error de base NO bloquea el cobro', async () => {
    prisma.job.findUnique.mockRejectedValue(new Error('db caída'));
    expect(await jobIsChargeable('j1')).toBe(true);
  });
});

describe('requestIsChargeable', () => {
  it('bloquea un pedido cancelado y deja pasar el resto', async () => {
    prisma.request.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    expect(await requestIsChargeable('r1')).toBe(false);
    prisma.request.findUnique.mockResolvedValue({ status: 'CLOSED' });
    expect(await requestIsChargeable('r1')).toBe(true);
  });
});

describe('reportOrphanPayment', () => {
  it('avisa por Telegram con el código legible del trabajo', async () => {
    prisma.job.findUnique.mockResolvedValue({ code: 'T-134' });
    await reportOrphanPayment({ ref: 'job::j1', paidAmount: 45000 });
    expect(tgNotifyOrphanPayment).toHaveBeenCalledWith({ ref: 'job::j1', code: 'T-134', paidAmount: 45000 });
  });
  it('no lanza si Telegram falla', async () => {
    prisma.job.findUnique.mockResolvedValue(null);
    tgNotifyOrphanPayment.mockRejectedValueOnce(new Error('telegram caído'));
    await expect(reportOrphanPayment({ ref: 'job::j1', paidAmount: 1 })).resolves.toBeUndefined();
  });
});

// El escenario que motiva todo esto: el admin canceló, pero el link de MP se pagó igual.
describe('confirmPaidByRef con el pedido ya cancelado', () => {
  it('NO confirma un trabajo cancelado y avisa al admin', async () => {
    prisma.job.findUnique.mockResolvedValue({ status: 'CANCELLED', code: 'T-134' });
    expect(await confirmPaidByRef('job::j1', 45000)).toBe(false);
    // lo importante: no se creó ninguna orden ni se marcó el trabajo como pagado
    expect(prisma.order.upsert).not.toHaveBeenCalled();
    expect(prisma.job.update).not.toHaveBeenCalled();
    expect(tgNotifyOrphanPayment).toHaveBeenCalled();
  });

  it('NO confirma un ítem suelto cancelado', async () => {
    prisma.request.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    expect(await confirmPaidByRef('r1::q1', 45000)).toBe(false);
    expect(prisma.order.upsert).not.toHaveBeenCalled();
    expect(prisma.requestQuote.findUnique).not.toHaveBeenCalled();
  });
});
