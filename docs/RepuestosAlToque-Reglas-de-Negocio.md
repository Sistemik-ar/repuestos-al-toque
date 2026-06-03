# RepuestosAlToque — Reglas de negocio (validación del modelo)

Cada frase describe una regla del producto. Sirve para chequear que el modelo de datos
([db/schema.sql](../db/schema.sql)) la soporte.

**Leyenda:** ✅ ya soportado · ⚠️ necesita ajuste en el modelo · 🔵 decisión a confirmar

---

## Usuarios y roles
- Hay cuatro roles: administrador, mecánico, vendedor y repartidor. ✅
- Los administradores (Jorge, Guille, Ale, Felipe) cargan a mano a vendedores, mecánicos y repartidores. ✅
- Cada usuario recibe una invitación por email y define su propia contraseña. ✅
- Un usuario tiene un único rol. ✅ 🔵 *(¿un comercio podría además ser repartidor? por ahora no)*
- Un usuario puede estar pendiente, activo o suspendido. ✅
- Un vendedor pertenece a un comercio (nombre, razón social, CUIT, IVA, dirección, barrio, cuenta MP). ✅
- Un repartidor puede pertenecer a una empresa de fletes. ✅
- Cada usuario ve solo lo suyo; los administradores ven todo. ✅

## Pedidos
- Un mecánico crea pedidos. ✅
- **Un pedido puede incluir varios productos distintos (ej: 5).** ⚠️🔵 *(hoy el modelo tiene 1 pieza por pedido → requiere `request_items`)*
- Cada producto del pedido tiene categoría, descripción, cantidad y fotos. ⚠️ *(hoy a nivel pedido)*
- Un pedido es para un vehículo (marca/modelo/año/VIN opcional). ✅
- Un pedido tiene una urgencia (necesito ahora / hoy / mañana). ✅
- Un pedido recibe ofertas durante una ventana de 10 minutos. ✅
- Las ofertas no se ven hasta que cierra la ventana; entran todas juntas. ✅
- Si no llega ninguna oferta, el pedido se puede reintentar en otra ventana. ✅
- El mecánico puede adjuntar fotos al pedido. ✅
- **El mecánico puede pedir que todo llegue en un mismo envío**, aunque sean de varios vendedores. ⚠️🔵 *(requiere agrupar envío)*

## Cotizaciones
- Varios vendedores pueden cotizar un mismo pedido. ✅
- Un vendedor cotiza por producto (si el pedido tiene varios). ⚠️ *(depende de `request_items`)*
- Un vendedor puede ofrecer más de una opción (A/B) para lo mismo. ✅
- Una cotización tiene precio, marca de pieza, garantía, nota y hasta 3 fotos. ✅
- Las cotizaciones se ordenan por la calificación del vendedor. ✅
- El vendedor puede marcar "sin disponibilidad" sin penalizarse. ⚠️ *(hoy no se registra; conviene guardarlo para métricas)*
- El vendedor puede pedirle más información al mecánico (preguntas predefinidas). ✅
- El mecánico puede responder esa información. ✅

## Anonimato
- El mecánico ve a los vendedores como alias hasta concretar la venta. ✅
- El vendedor ve solo el barrio/zona del mecánico, no su identidad. ✅
- La identidad real se revela al concretarse la venta (o con el remito). ✅

## Selección, pago y comisión
- El mecánico elige una cotización. ✅ *(por producto si el pedido es multi‑producto)* ⚠️
- **Si el pedido tiene varios productos, puede elegir distinto vendedor para cada uno.** ⚠️🔵
- Paga el cliente (dueño del auto) o el mecánico; la comisión la paga el cliente. ✅
- La comisión es 5% del precio del repuesto. ✅
- El pago es por Mercado Pago y se reparte automático: repuesto al vendedor, comisión a la plataforma. ✅
- El flete es una pata aparte del pago. ✅ ⚠️🔵 *(cómo se cobra/liquida, pendiente)*
- El mecánico puede generar un link de pago para que pague el cliente. ✅
- Cada venta deriva en factura del vendedor al cliente y factura de la plataforma por la comisión. ✅ *(facturación fuera del sistema)*

## Envío (flete tercerizado)
- Cada venta concretada genera un envío. ✅
- **Un envío puede consolidar varios productos** (incluso de varios vendedores) en un solo flete. ⚠️🔵
- **Un envío puede retirar de uno o varios puntos de venta** y entregar en el taller. ⚠️🔵
- El vendedor marca "salió el pedido"; la empresa de fletes retira y entrega. ✅
- El envío pasa por estados: preparando → retirado → en camino → entregado. ✅
- El tamaño del paquete (moto/auto/utilitario) define el tipo de vehículo del flete. ✅

## Reputación y calidad
- Un vendedor suma puntos cuando concreta una venta. ✅
- Un mecánico puede dejar reseña de uno o varios pedidos/ventas. ✅
- La calificación es bidireccional (mecánico ↔ vendedor). ✅
- La calificación del vendedor ordena sus cotizaciones. ✅
- Malas calificaciones reiteradas → aviso, suspensión, cancelación. ✅ *(vía estado + lógica)*
- Los niveles/insignias se derivan de las operaciones completadas. ✅

## Publicidad
- Un vendedor puede tener avisos (marca + descuento + foto), **sin enlace**. ✅
- Los avisos se muestran al mecánico mientras espera ofertas. ✅
- Los avisos se cobran. 🔵 *(cómo, a definir)*

## Administración
- Los administradores aprueban, suspenden, editan y resetean contraseñas. ✅
- Queda registro de qué administrador hizo cada cambio. ✅
- El administrador ve métricas: pedidos, ingresos por comisión, tiempos, conversión. ✅ *(derivable)*

---

## Decisiones clave a confirmar (y su impacto en el modelo)

1. **¿Un pedido es 1 producto o varios (carrito)?** — Es el cambio más grande. Si es multi‑producto, se agrega `request_items` (cada ítem con categoría/descripción/cantidad/fotos) y las cotizaciones pasan a ser **por ítem**.
2. **¿Se puede elegir distinto vendedor por producto?** — Si sí, una `order` agrupa ítems de varios vendedores (y el split de MP reparte a cada uno).
3. **¿Envío consolidado con varios retiros?** — Un `shipment` con múltiples puntos de retiro → una entrega en el taller.
4. **¿El flete cómo se cobra y se le paga a la empresa?** (la 3ra pata).
5. **¿"Sin disponibilidad" se registra** para medir el comportamiento del comercio?
6. **¿Cómo se cobra la publicidad?**

> Si vamos a multi‑producto (1‑3), el modelo evoluciona así (resumen):
> `requests` (el pedido/carrito) → `request_items` (cada producto) → `quotes` por ítem → `order_items` (lo elegido, posiblemente de distintos vendedores) → `shipment` que agrupa ítems en un flete.
