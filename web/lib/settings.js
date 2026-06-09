// Configuración del negocio (server-only). Comisión de la plataforma y recargo de Mercado Pago.
import { prisma } from '@/lib/db';

export const DEFAULTS = {
  commissionPct: 5, // % que cobra RepuestosAlToque sobre el repuesto
  mpFeePct: 6.39, // % de Mercado Pago (según plazo de acreditación; incluí IVA si querés cubrirlo)
  mpFeeEnabled: false, // sumar el recargo de MP al total que paga el cliente
  minShip: 5000, // costo de envío mínimo (editable desde el backoffice)
};

export async function getSettings() {
  try {
    const rows = await prisma.setting.findMany();
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      commissionPct: m.commissionPct != null ? Number(m.commissionPct) : DEFAULTS.commissionPct,
      mpFeePct: m.mpFeePct != null ? Number(m.mpFeePct) : DEFAULTS.mpFeePct,
      mpFeeEnabled: m.mpFeeEnabled != null ? m.mpFeeEnabled === 'true' : DEFAULTS.mpFeeEnabled,
      minShip: m.minShip != null ? Number(m.minShip) : DEFAULTS.minShip,
    };
  } catch {
    return { ...DEFAULTS };
  }
}
