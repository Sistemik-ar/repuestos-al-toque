// Lógica pura de cuenta corriente (testeable sin base de datos).

// La relación queda ACTIVA solo con doble aprobación (admin + comercio) y sin desactivar.
export function creditActive(adminStatus, storeStatus, disabledAt) {
  return adminStatus === 'APPROVED' && storeStatus === 'APPROVED' && !disabledAt;
}

// Estado mostrado al usuario, derivado del registro.
export function creditStatus(cc) {
  if (cc.disabledAt) return 'DISABLED';
  if (cc.adminStatus === 'REJECTED' || cc.storeStatus === 'REJECTED') return 'REJECTED';
  if (cc.active) return 'ACTIVE';
  return 'PENDING';
}
