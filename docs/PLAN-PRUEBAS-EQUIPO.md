# Plan de pruebas con el equipo — antes de salir a producción

> Guión para probar entre todos (Jorge, Guille, Ale, Felipe) en una sesión de ~1h.
> La idea es recorrer los flujos reales con celulares de verdad, no solo en la compu.

## Antes de empezar (1 persona, 10 min)

- [ ] En **Vercel**: `AUTH_SECRET` seteado, `MP_TEST_AMOUNT` **borrado**, `DATABASE_URL` con el pooler 6543, `NEXT_PUBLIC_SHOW_TEST_ACCOUNTS` **sin setear**.
- [ ] En **Admin → Comisión y recargo**: poner el % real y el envío mínimo ($5.000).
- [ ] En **Admin → Tarifas por km**: cargar las bandas reales de la empresa de fletes.
- [ ] **Alta de cuentas reales** (mecánico, 2 comercios, 1 repartidor) con direcciones exactas de Bariloche.
- [ ] Cada uno entra con su cuenta y **cambia la contraseña temporal** que le pasó el admin.

## Guión de prueba (todos juntos, con sus celus)

### 1. Mecánico — crear un trabajo
- [ ] Crear un pedido con patente real, foto, y descripción del repuesto.
- [ ] Agregar un **segundo repuesto** al mismo auto ("seguir comprando").
- [ ] Probar el borde: intentar crear otro trabajo con **la misma patente** → debe avisar.
- [ ] "Eso es todo" → arranca la ventana de 10 minutos.

### 2. Comercios — cotizar (2 personas en paralelo)
- [ ] Los dos comercios ven la solicitud entrar **en vivo**.
- [ ] Cotizar con precio, marca, garantía y foto.
- [ ] Un comercio manda **2 opciones** (original + alternativa).
- [ ] Verificar que el mecánico **NO ve el nombre** del comercio (solo "Proveedor A/B").
- [ ] Verificar que el comercio **NO ve el nombre** del taller.

### 3. Mecánico — elegir y pagar
- [ ] Al cerrar la ventana, comparar ofertas (ordenadas por reputación; el nuevo aparece como "Nuevo").
- [ ] Elegir una oferta de cada repuesto.
- [ ] Generar el link de pago → **pagar con una tarjeta real** (monto chico).
- [ ] Probar el borde: generar el link **dos veces** → tiene que ser el MISMO link (no cobra doble).
- [ ] Confirmar que en el panel del comercio aparece "Pendiente de pago" → luego "Pagado".

### 4. Repartidor — el reparto
- [ ] El repartidor ve el pedido disponible y lo toma.
- [ ] Probar consolidación: si el auto tenía 2 repuestos del mismo comercio, **un solo viaje**.
- [ ] "Llegué al comercio" → el comercio recibe el aviso (sonido + cartel).
- [ ] El comercio confirma el retiro con el **PIN** del repartidor (probar un PIN incorrecto primero).
- [ ] "Llegué al taller" → el mecánico recibe el aviso.
- [ ] El repartidor confirma la entrega con el **PIN** del mecánico.

### 5. Calificación y reputación
- [ ] El mecánico califica vendedor / producto / delivery.
- [ ] Verificar que el comercio **suma 1 punto** y le sube el promedio.
- [ ] Verificar que el repartidor ve su reputación en el panel.

### 6. Cuenta corriente (opcional, si aplica)
- [ ] El mecánico pide CC a un comercio → el admin valida → el comercio aprueba.
- [ ] En el próximo pago con ese comercio, la app cobra **solo comisión + envío** (no el repuesto).

### 7. Casos de borde a provocar a propósito
- [ ] No pagar un trabajo y dejarlo 24hs → debe quedar **cancelado** solo.
- [ ] Cerrar la ventana sin que llegue ninguna oferta → poder **reintentar**.
- [ ] Suspender una cuenta desde el admin → esa persona queda afuera en menos de 30 segundos.
- [ ] Entrar a cada panel desde el **celular** (no solo compu): que nada se corte ni quede un cartel de "no hay nada" de entrada.

## Qué probar específicamente en celular (mobile)

- [ ] Subir fotos desde la cámara del teléfono (incluir un iPhone — ojo con HEIC).
- [ ] Los PINs se tipean cómodos (teclado numérico).
- [ ] La barra de navegación de abajo (mecánico): Inicio, Cotizaciones, +, Cuentas, Perfil — **todos llevan a algo real**.
- [ ] Cerrar sesión desde Perfil.
- [ ] Nada se sale de la pantalla ni aparece scroll horizontal.

## Qué FALTA / riesgos conocidos antes de producción

| Tema | Estado | Mitigación para el piloto |
|---|---|---|
| **Notificaciones push** | No hay (solo se actualiza solo cada pocos segundos) | Grupo de WhatsApp "Pedidos RAT" para avisar que entró un pedido |
| **Reset de contraseña in-app** | No hay | El admin la resetea a mano |
| **Reembolsos in-app** | No hay | Se hace a mano desde el panel de Mercado Pago |
| **Liquidación a comercios/fletes** | No automática | El panel "Por cobrar" muestra cuánto; se paga semanal a mano |
| **Liberar un pedido que un repartidor tomó y no fue** | No hay | Pedir al admin que lo destrabe en la base |
| **Webhook de MP sin validar firma** | Mitigado (se consulta el pago real a MP antes de confirmar) | OK para piloto |
| **Suite E2E no 100% verde de una pasada** | Flakiness de infraestructura de test (no de la app) | Cada flujo pasa aislado; subir `connection_limit` del entorno de test post-piloto |

## Config que SÍ o SÍ tiene que estar antes del go-live

1. `AUTH_SECRET` propio en Vercel (si falta, el deploy falla a propósito).
2. `MP_TEST_AMOUNT` **borrado** de Vercel (si queda, no se cobra el monto real Y se desactiva la verificación de monto del webhook).
3. Pricing real + tarifas reales cargadas en el Admin.
4. Una **compra real de prueba** de punta a punta (tarjeta real, ver el webhook en los logs de Vercel, y ensayar un reembolso desde MP).
