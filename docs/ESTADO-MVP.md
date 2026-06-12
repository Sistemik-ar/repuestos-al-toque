# Estado real del MVP — código vs. reglas de negocio

> Actualizado: 12/06/2026. Este doc corrige las discrepancias entre
> `RepuestosAlToque-Reglas-de-Negocio.md` (previo al desarrollo) y lo implementado.

## ✅ Implementado y testeado (38 unit + 37 E2E)

- **Trabajos por vehículo**: patente/VIN obligatorio, multi-ítem, borrador → publicar,
  ventana única de 10 min, agrupación anti-"patente trucha".
- **Cotización**: en vivo durante la ventana (se ven llegar, **se elige recién al cerrar** —
  regla actualizada por decisión del equipo; reemplaza al "sobre cerrado" estricto del doc),
  hasta 3 opciones por comercio (Original/Alternativa/Usado), con fotos.
- **Anonimato**: alias por comercio, mecánico anónimo para el vendedor (testeado E2E).
  Excepción por diseño: la Cuenta Corriente muestra identidades (socios conocidos).
- **Pago**: link único de MP por trabajo (cobro CENTRALIZADO en cuenta propia, **SIN split**
  — el README viejo decía split; la decisión vigente es centralizado hasta tener Marketplace).
  Link persistido (regenerar devuelve el mismo). Confirmación idempotente (webhook + retorno).
- **Cuenta Corriente**: doble aprobación (admin + comercio), toggle por ítem en el checkout
  (solo se cobra comisión + envío), desactivable por admin.
- **Pendiente de pago → cancelado a las 24hs** (trabajo e ítems). "Volver a pedir".
- **Reparto**: habilitación estilo Uber (DNI/licencia/seguro), "Tomar pedido" atómico,
  aviso de llegada con toast+sonido, PIN de retiro (valida el vendedor) y de entrega
  (valida el mecánico), incidencia "nadie me atendió".
- **Calificaciones**: vendedor/producto/delivery al entregar; el promedio del comercio
  ordena sus cotizaciones futuras.
- **Envío**: dirección validada (real + en Bariloche) al alta, distancia de manejo real
  (OSRM), tabla de bandas por km + mínimo configurables, 1 envío por comercio por trabajo.
- **Backoffice**: alta de usuarios con geocodificación, comisión/recargo MP/envío mínimo,
  tarifas por km, CC, suspender (expulsa en ≤30s aunque tenga sesión activa).
- **Seguridad**: rutas por rol (middleware), ownership en todas las actions, guards de
  estado (pestañas viejas no corrompen), pool limitado, endpoints legacy eliminados.

## ⚠️ En el doc de reglas figura ✅ pero NO está implementado

| Regla | Estado real | Decisión sugerida |
|---|---|---|
| Aceptación de términos al ingresar | Campo en DB sin uso | Checkbox en primer login (post-piloto) |
| Auditoría de acciones del admin | Modelo `AuditLog` sin uso | Post-piloto |
| Vendedor pide más info al mecánico | No existe | Evaluar tras el piloto (¿hace falta?) |
| Invitación por email + reset de contraseña | El alta muestra pass temporal al admin | OK para piloto manual; email post-piloto |

## ❌ Conocido y aceptado para el piloto

- **Notificaciones**: no hay (solo polling). Mitigación: grupo de WhatsApp "Pedidos RAT".
  *Primer candidato post-freeze si se caen ventas por ventanas no vistas.*
- "Sin stock" del comercio es solo visual (no se registra).
- Identidad del vendedor **no se revela ni después del pago** (el doc decía que sí con el
  remito) — el repartidor es el puente físico. Decidir si el mecánico debe verla.
- Sin reembolso in-app (protocolo manual por panel de MP), sin liquidación automática a
  vendedores (semanal manual; el panel "Por cobrar" muestra cuánto), sin liberar un pedido
  tomado por un repartidor que no va (pedir al admin/DB), publicidad sin uso, webhook de MP
  sin validar `x-signature` (mitigado: se consulta el pago real a MP antes de confirmar).

## 🔧 Config pendiente para salir (no es código)

1. Vercel: quitar `MP_TEST_AMOUNT` · `DATABASE_URL` → pooler 6543 con `pgbouncer=true&connection_limit=1`.
2. Admin: pricing real (comisión/recargo) + envío mínimo a $5.000 + tarifas reales por km.
3. Altas reales con direcciones exactas. AUTH_SECRET propio en prod (ya seteado).
