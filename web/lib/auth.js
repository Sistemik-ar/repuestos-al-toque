// Rutas por rol (roles según los enums de la base) + cuentas de prueba (seed).
export const ROLE_HOME = {
  ADMIN: '/admin',
  STORE: '/comercio',
  MECHANIC: '/mecanico',
  DELIVERY: '/repartidor',
};

// Cuentas creadas por el seed (password: repuestos123)
export const TEST_ACCOUNTS = [
  ['admin@repuestosaltoque.com.ar', 'Admin'],
  ['mecanico@repuestosaltoque.com.ar', 'Mecánico'],
  ['vendedor@repuestosaltoque.com.ar', 'Vendedor'],
  ['repartidor@repuestosaltoque.com.ar', 'Repartidor'],
];
