import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    requestQuote: { findUnique: vi.fn(), update: vi.fn() },
    request: { findUnique: vi.fn(), update: vi.fn() },
    storeProfile: { findUnique: vi.fn() },
    mechanicProfile: { findUnique: vi.fn() },
    shippingTariff: { findMany: vi.fn() },
    setting: { findMany: vi.fn() },
    order: { upsert: vi.fn() },
  },
}));

import { prisma } from '@/lib/db';
import { confirmPaidByRef } from '@/lib/orders';

beforeEach(() => vi.clearAllMocks());

describe('confirmPaidByRef', () => {
  it('devuelve false con ref inválido', async () => {
    expect(await confirmPaidByRef('')).toBe(false);
    expect(await confirmPaidByRef('sinseparador')).toBe(false);
  });

  it('devuelve false si la cotización no existe', async () => {
    prisma.requestQuote.findUnique.mockResolvedValue(null);
    expect(await confirmPaidByRef('r1::q1')).toBe(false);
  });

  it('crea la orden (con comisión 5% y envío mínimo) y marca el pedido pagado', async () => {
    prisma.requestQuote.findUnique.mockResolvedValue({ id: 'q1', requestId: 'r1', storeId: 's1', price: 39900, request: { mechanicId: 'm1' } });
    prisma.request.findUnique.mockResolvedValue({ mechanicId: 'm1' });
    prisma.storeProfile.findUnique.mockResolvedValue({ lat: null, lng: null });
    prisma.mechanicProfile.findUnique.mockResolvedValue({ lat: null, lng: null });
    prisma.shippingTariff.findMany.mockResolvedValue([]);
    prisma.setting.findMany.mockResolvedValue([]); // usa defaults: comisión 5%, sin recargo
    prisma.order.upsert.mockResolvedValue({});
    prisma.requestQuote.update.mockResolvedValue({});
    prisma.request.update.mockResolvedValue({});

    const ok = await confirmPaidByRef('r1::q1');
    expect(ok).toBe(true);

    const arg = prisma.order.upsert.mock.calls[0][0];
    expect(arg.create.partAmount).toBe(39900);
    expect(arg.create.commissionAmount).toBe(1995); // 5%
    expect(arg.create.freightAmount).toBe(5000); // mínimo, sin coordenadas
    expect(arg.create.total).toBe(39900 + 1995 + 5000);
    expect(prisma.request.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PAID' } }));
  });
});
