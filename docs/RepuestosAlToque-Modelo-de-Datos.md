# RepuestosAlToque — Modelo de datos

Diseño de la base de datos derivado de las decisiones de producto. Pensado para
Postgres / Supabase. El SQL concreto está en [`db/schema.sql`](../db/schema.sql).

> Reglas que atraviesan todo el modelo:
> - **Anonimato bilateral:** el mecánico no ve la identidad real del vendedor hasta concretar; el vendedor no ve la del mecánico. Antes del pago solo se expone el **alias** del vendedor y el **barrio/zona** del taller.
> - **Cobro:** split de Mercado Pago. Comisión **5%**, la paga el **cliente** (se suma). El **flete** es una pata aparte (empresa tercerizada).
> - **Onboarding 100% manual (MVP):** los admins cargan **a todos** —vendedores, mecánicos y repartidores— desde el backoffice. No hay registro público todavía. La contraseña la define cada uno por **invitación** (no la cargan los admins), y como vienen verificados el estado puede arrancar en **activo**. Más adelante se puede abrir el auto‑registro de mecánicos.

---

## Entidades

### 1. profiles (base de todos los usuarios)
Una fila por usuario, ligada a la cuenta de acceso (auth). Roles: **admin, mechanic (mecánico), seller (vendedor), freight (fletes)**.
- Identidad: email, nombre, teléfono, whatsapp
- Gestión: estado (pendiente/activo/suspendido), fecha de alta, **quién lo dio de alta**, notas internas, aceptación de términos
- Reputación (mecánico y vendedor): calificación promedio, cantidad de reseñas, puntos, operaciones completadas

### 2. mechanics (1‑a‑1 con profile, rol mechanic)
Nombre del taller, tipo (taller/particular), barrio/zona, dirección, geo (lat/lng), CUIT (opcional).

### 3. stores (vendedor — 1‑a‑1 con profile, rol seller)
Nombre del local, **razón social**, **CUIT (único)**, **condición de IVA**, titular/responsable, dirección, **barrio**, geo, **horarios y días**, persona de contacto operativo, tipo de repuesto (nuevo), **datos de cobro** (cuenta MP vinculada, estado de vinculación, CBU/alias), facturación (tipo A/B/C, punto de venta), logo y foto del frente.
- **store_categories**: categorías de repuestos que maneja (N‑a‑N con `categories`).
- **store_brands** *(opcional)*: marcas de vehículos que cubre.

### 4. freight_companies + freight_tariffs (fletes tercerizados)
Empresa de envíos (razón social, CUIT, contacto, **tipos de vehículo** moto/auto/utilitario, zonas de cobertura, cómo se le paga) y su **tarifa** (por zona y tamaño de paquete). La tarifa es la "tercera pata" del pago.

### 4b. couriers (repartidores)
Repartidores individuales, **cargados a mano** por los admins (1‑a‑1 con profile, rol `courier`). Pueden pertenecer a una empresa de fletes: tipo de vehículo (moto/auto/utilitario), patente, zonas que cubre, CUIT.

### 5. categories / vehicle_brands / vehicle_models (catálogos)
Categorías de repuesto (Frenos, Motor…) y catálogo de marcas/modelos (las 24 marcas AR).

### 6. requests (pedidos del mecánico)
**Cada pedido es por un solo producto.** Código legible (#1042), mecánico, vehículo (marca/modelo/año/VIN), categoría, descripción, **urgencia** (ahora/hoy/mañana), **fotos**, **tipo de factura** (Consumidor Final o Factura A — con razón social y CUIT del comercio emisor y del solicitante), estado (open→closed→paid→shipped→delivered), ventana de cotización (segundos + cierre), e **info extra** (respuesta del mecánico cuando el vendedor pide datos).

### 7. info_requests (vendedor pide más info)
Preguntas predefinidas + texto que un vendedor le hace al mecánico sobre un pedido, y si fue respondida.

### 8. quotes (cotizaciones)
Por pedido y vendedor: **alias** (lo que ve el mecánico), marca de la pieza, **precio**, garantía, nota, **hasta 3 fotos** (validado en la base), calificación al momento (para ordenar), etiqueta de opción (A/B… porque el vendedor puede mandar varias), estado (enviada/elegida/rechazada).

### 9. orders (venta concretada)
Pedido + cotización elegida + mecánico + vendedor, con el desglose del dinero: **monto del repuesto**, **% y monto de comisión**, **monto de flete**, total, quién paga, estado.

### 10. payments (Mercado Pago)
Pago asociado a la orden: id de MP, estado, monto, **split** (vendedor / comisión / flete) y el payload crudo del webhook.

### 11. shipments (envío)
Agrupa **una o varias órdenes** del mismo mecánico (**consolidación**): puede retirar de **varios puntos de venta** y entregar en un único destino (el taller). Empresa de fletes, tamaño de paquete, estado (pendiente→retirado→en camino→entregado). El "salió el pedido" del vendedor pasa el envío a *retirado*.

### 12. ratings (calificaciones bidireccionales)
Por orden: de quién, a quién, estrellas (1–5), comentario. Alimenta la reputación de `profiles`.

### 13. ads (publicidad patrocinada)
Aviso de un vendedor: marca + descuento + imagen, **sin enlace**, con vigencia.

### 14. admin_audit (auditoría)
Quién (de los 4 admins) hizo qué cambio y cuándo. Útil siendo varios administradores.

---

## Relaciones (resumen)
- `profiles` 1—1 `mechanics` / `stores` / `couriers` (según rol).
- `couriers` N—1 `freight_companies`.
- `stores` N—N `categories` (vía `store_categories`).
- `requests` N—1 `mechanics`; `requests` 1—N `quotes`; `quotes` N—1 `stores`.
- `requests` 1—N `info_requests`.
- `orders` 1—1 `request` y `quote`; `orders` 1—1 `payment`; `orders` 1—N `ratings`.
- `shipments` 1—N `orders` (un envío **consolida** varias órdenes / puntos de retiro).
- `freight_companies` 1—N `freight_tariffs`; `shipments` N—1 `freight_companies`.
- `ads` N—1 `stores`.

---

## Cómo se hace cumplir el anonimato (capa de datos)
- El mecánico consulta las cotizaciones a través de una **vista pública** que expone solo: alias, precio, marca de pieza, garantía, calificación y fotos — **nunca** `store_id` ni datos de contacto.
- La identidad real del vendedor recién se "revela" cuando hay una `order` pagada de esa cotización (o, en la práctica del piloto, llega con el remito).
- El vendedor ve los `requests` abiertos (marketplace) **sin** datos de contacto del mecánico; solo barrio/zona.
- Reglas de acceso (RLS en Supabase): cada usuario ve lo suyo; admins ven todo. Detalle en el SQL.

---

## Alcance: qué va en el MVP y qué después
**MVP (esencial para operar y cobrar):** profiles, mechanics, stores (con MP vinculado), categories, requests, quotes, orders, payments, shipments, ratings, freight_companies + tariffs, info_requests.
**Después:** vehicle_brands/models como tablas (al inicio puede ser lista en la app), store_brands, ads, admin_audit, geolocalización fina, múltiples sucursales.
