# RepuestosAlToque

**Marketplace de repuestos urgentes para Bariloche.** Conecta **mecánicos**, **casas de repuestos** y **repartidores**: el mecánico pide un repuesto, recibe cotizaciones en vivo de comercios cercanos, elige, paga y recibe el envío — sin perder horas al teléfono.

> El foco del producto es **velocidad operativa y simplicidad**. Los usuarios trabajan en talleres y comercios, muchas veces desde el celular. Mobile-first, pero funciona igual de bien en desktop.

---

## La idea en 30 segundos

1. El **mecánico** carga un pedido (un solo producto): vehículo, pieza, urgencia, tipo de factura.
2. Se abre una **ventana de cotización de 10 minutos**. Las casas de repuestos cercanas reciben el lead y cotizan.
3. Las ofertas se **revelan todas juntas al cerrar la ventana**, ordenadas por la reputación del vendedor.
4. **Anonimato bilateral**: el mecánico ve un alias del vendedor; el vendedor ve solo la zona del taller. La identidad real se revela **al concretar la venta**.
5. El mecánico elige una oferta y paga por **Mercado Pago** (split automático: repuesto al vendedor, **comisión 5%** a la plataforma, la paga el cliente).
6. La **empresa de fletes tercerizada** retira (puede **consolidar** varios pedidos de distintos puntos) y entrega en el taller.
7. Calificación **bidireccional** mecánico ↔ vendedor; la reputación ordena las cotizaciones.

**Onboarding 100% manual (MVP):** los administradores dan de alta a todos por invitación; cada usuario define su contraseña.

---

## Roles

| Rol | Qué hace |
|-----|----------|
| **Mecánico** | Pide repuestos, compara cotizaciones, paga, sigue el envío, califica. |
| **Casa de repuestos (vendedor)** | Recibe leads en vivo, cotiza (con fotos/garantía), pide info, marca "salió el pedido". |
| **Repartidor / Fletes** | Retira de uno o varios puntos y entrega en el taller. *(flujo en definición)* |
| **Administrador (backoffice)** | Alta e invitaciones, suspender/activar/resetear, métricas, moderación de reseñas, fletes y tarifas, auditoría. |

### Estados del pedido
`Abierto → Cotizando → Cotización aceptada → Preparando → En reparto → Entregado` · (`Cancelado` en cualquier punto).

---

## Estructura del repo

```
repuestos-al-toque/
├── web/                 # 🟢 APP REAL (producción) — Next.js
│   ├── app/             #    rutas: /, /mecanico, /comercio, /admin, /terminos…
│   ├── components/
│   ├── lib/             #    datos, store, helpers
│   └── app/globals.css  #    design system (fuente de verdad)
│
├── demo/                # 🟣 DEMO navegable — HTML/CSS/JS estático, datos simulados
│   ├── index.html       #    landing
│   ├── login.html       #    login (elegís cualquier rol)
│   ├── mecanico-*.html  #    dashboard, pedido, cotizaciones, pago, seguimiento, historial, perfil
│   ├── comercio*.html   #    panel + perfil del comercio
│   ├── repartidor.html  #    vista preliminar
│   ├── admin*.html      #    resumen, usuarios, moderación, fletes, auditoría
│   ├── terminos.html
│   └── assets/          #    styles.css (design system portado) + app.js (mock data, toasts, nav)
│
├── db/                  # esquema de base de datos (Postgres / Supabase)
├── docs/                # modelo de datos + reglas de negocio
└── README.md
```

### App real vs. Demo

|  | **App real** (`web/`) | **Demo** (`demo/`) |
|--|----------------------|--------------------|
| Tecnología | Next.js (con backend/auth/MP reales) | HTML + CSS + JS vanilla, sin build |
| Datos | reales (Supabase) | **simulados** en el navegador |
| Login | email + contraseña → entra a **tu** rol | elegís cualquier rol para recorrer |
| URL | `repuestosaltoque.com.ar/` | `repuestosaltoque.com.ar/demo/` |
| Para qué | producción | mostrar producto / vender / validar flujos |

---

## Rutas en producción (objetivo)

- **`/`** → Landing pública. Botón **Ingresar** → login.
- **`/login`** → email + contraseña. Al autenticar, **redirige según el rol** de la cuenta:
  - `admin` → `/admin` (backoffice)
  - `seller` → `/comercio`
  - `mechanic` → `/mecanico`
  - `courier` → `/repartidor`
- **`/demo/`** → la demo estática. Sirve para recorrer **cualquier** rol con datos simulados (no requiere cuenta real).

> En la **app real** el rol viene de la cuenta (no se elige). En la **demo** se elige a propósito, para poder mostrar todo.

---

## Cómo levantarlo

### App real (`web/`)
```bash
cd web
npm install
npm run dev          # http://localhost:3000
```

### Demo (`demo/`) — es estática, sin build
```bash
cd demo
python3 -m http.server 5173    # http://localhost:5173
# (o cualquier server estático; abrir index.html directo también funciona)
```

### Servir la demo bajo `/demo` en producción
La demo son archivos estáticos. La forma más simple de tener `/` (app real) y `/demo` (demo) en el mismo dominio:

**Opción A — dentro de Next.js (recomendado):** copiar la carpeta a `web/public/demo/`. Next sirve `public/` en la raíz, así que queda disponible en `repuestosaltoque.com.ar/demo/`.
```bash
cp -r demo web/public/demo
```

**Opción B — deploy separado:** publicar `demo/` como sitio estático aparte (Vercel/Netlify) y apuntar `repuestosaltoque.com.ar/demo` con un rewrite.

---

## Design system

Estética **dark automotive**, púrpura `#6D28D9` + amarillo `#FACC15`, tipografía Inter. La fuente de verdad es `web/app/globals.css`; la demo usa una copia en `demo/assets/styles.css` (mismos tokens, componentes y, además, una capa **responsive** con sidebar en desktop y bottom-nav en mobile). Cualquier cambio de marca debería reflejarse en ambos.

---

## Pendientes de definir (decisiones de negocio, no de diseño)

- **Flete:** cómo se cobra y se liquida a la empresa de envíos (la "3ra pata" del pago).
- **Repartidor:** flujo detallado (la demo trae una vista preliminar).
- **Publicidad** de comercios y registro de **"sin disponibilidad"** para métricas.

---

## Estado

Prototipo / MVP en construcción. La demo refleja el producto completo (landing, login, 3 roles operativos + backoffice). La app real (`web/`) se desarrolla en paralelo con backend.
