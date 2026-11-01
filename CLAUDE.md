# CLAUDE.md — cómo se trabaja en este proyecto

**RepuestosAlToque**: marketplace de repuestos urgentes para Bariloche. El mecánico pide
un repuesto por patente, las casas de repuestos cotizan en una ventana de 10 minutos, el
mecánico elige al cerrar la ventana, paga por Mercado Pago y un repartidor habilitado
retira y entrega con PIN. Anonimato bilateral hasta concretar, reputación y puntos,
cuenta corriente para socios conocidos, backoffice de admin.

Cuatro usuarios reales que importan: **mecánicos** (en el taller, desde el celular, con
las manos sucias), **casas de repuestos** (cotizan contra reloj), **repartidores** y el
**admin** (hoy el equipo propio: onboarding manual, moderación, tarifas). Es un MVP en
**piloto con gente real** (`docs/PLAN-PRUEBAS-EQUIPO.md`): hay pedidos y pagos de verdad.

## Fuentes de verdad, en orden

1. `docs/ESTADO-MVP.md` — qué está implementado de verdad, qué figura en las reglas
   pero no existe, y qué se aceptó dejar afuera. **Leer antes que las reglas de negocio.**
   Está al 12/06/2026; desde entonces se sumaron avisos por Telegram y push, cancelación
   de impagos desde el admin y consolidación por patente. Si el código y este doc no
   coinciden, gana el código, y actualizá el doc.
2. `docs/RepuestosAlToque-Reglas-de-Negocio.md` y `docs/RepuestosAlToque-Modelo-de-Datos.md`
   — la intención original. `docs/ARQUITECTURA.md` — el diseño técnico (dice Neon y
   split de MP: hoy es Supabase y cobro centralizado).
3. `/Users/feliarana/Projects/sistemik/sistemik-skills` — lo compartido de Sistemik:
   `docs/proyectos.md` (este proyecto entre los demás), `docs/estado-sistemik.md`
   (cuentas, dominio, categorización FortiGuard).
4. El código: `web/` es la app real; `demo/` es una maqueta estática con datos
   inventados que se sirve en `/demo/`.

## Rol

Ingeniero senior, no generador de código. Cuestioná lo que no cierre, explicá trade-offs,
proponé alternativas mejores. El objetivo es el producto, no cumplir la instrucción literal.

Si una decisión es de producto (qué ve el mecánico cuando nadie cotizó, cuándo se revela
la identidad, qué pasa si el repartidor no va), **no la adivines**: planteala con dos o
tres opciones y que Felipe la cierre con el equipo. Lo decidido va a `docs/ESTADO-MVP.md`.

## Idioma

- **Conversación, docs y commits: español rioplatense**, con acentos. Commits con prefijo
  de área y escritos desde lo que cambia para el usuario, no desde el diff:
  `fix(mecanico): que no queden pedidos sin enviar por confusión`.
- **Código:** el dominio en inglés en la base y el modelo (`Request`, `RequestQuote`,
  `Order`, `Shipment`, roles `MECHANIC`/`STORE`/`DELIVERY`) y en español en las rutas y la
  UI (`/mecanico`, `/comercio`, `/repartidor`). Seguí lo que ya hay al lado, no unifiques.

## Reglas duras

### Lo que le pasa a gente real

- Un pedido pagado es plata de un mecánico y una venta de un comercio. Cualquier cambio en
  `lib/orders.js`, `lib/mercadopago.js`, `lib/credit.js` o `lib/order-guards.js` se prueba
  con los E2E contra la base local **antes** de pushear.
- Los **guards de estado** (`lib/order-guards.js`) existen para que una pestaña vieja no
  corrompa un pedido. No los relajes para "simplificar" un flujo.
- **Anonimato**: la capa de lectura que ve el mecánico omite `store_id` y datos del
  vendedor; el alias es rotativo por trabajo (Proveedor A/B/C por orden de llegada). No
  agregues un campo "para debug" que lo filtre. La excepción por diseño es la cuenta
  corriente (socios conocidos).
- Ventana de cotización: las ofertas se ven llegar pero **se elige recién al cerrar**.
  Hasta 3 opciones por comercio. Una sola ventana por trabajo.

### Pagos (Mercado Pago)

- Cobro **centralizado** en la cuenta propia, **sin split** (decisión vigente; el README
  viejo dice otra cosa). Un link de pago por trabajo, persistido: regenerar devuelve el
  mismo.
- La confirmación es **idempotente** (webhook + retorno). El webhook no valida
  `x-signature`: se consulta el pago real a MP antes de confirmar. No confirmes nada sólo
  con el `payment_id` de la URL de retorno.
- Pendiente de pago → cancelado a las 24 h (trabajo e ítems), con "volver a pedir".
- Pruebas con `MP_TEST_ACCESS_TOKEN`; los avisos marcan que es prueba. Nunca un cobro de
  prueba con el token real.

### Seguridad

- La base se accede **sin RLS**: la seguridad es `middleware.js` (rol por sección) +
  **ownership en cada server action**. Toda action nueva verifica que el recurso sea del
  usuario de la sesión. Un `where: { id }` solo, sin dueño, es un bug.
- Sesión: cookie `rat_session` (JWT firmado con `AUTH_SECRET`). Suspender a alguien lo
  expulsa en ≤ 30 s aunque tenga sesión; no cachees el estado del usuario más que eso.
- Repartidor: habilitación estilo Uber (DNI, licencia, seguro) la hace el admin;
  "Tomar pedido" es atómico y se lleva todas las órdenes pagadas del mismo auto +
  comercio + taller.

### Base de datos

- Postgres en **Supabase** vía Prisma, esquema con `npm run db:push`. Detalle, local con
  Docker y seeds: `docs/agents/base-de-datos.md`. Los docs que dicen Neon están viejos.
- `npm run db:demo` **aborta si `DATABASE_URL` es de producción**. No saques esa guarda ni
  la copies mal a un script nuevo: todo script que escribe datos de prueba la lleva.
- `db/schema.sql` y `db/rls.sql` son de la etapa anterior (Supabase directo): referencia,
  no se aplican. `*.sql` está en el gitignore global de esta Mac: si agregás uno,
  `git ls-files | grep sql` para confirmar que quedó.

### Secretos y variables

- `web/.env` (ignorado) tiene las reales; `web/.env.test` (commiteado) apunta al Postgres
  de Docker y no lleva secretos. Nunca copies un valor de `.env` a `.env.test`.
- Sólo `NEXT_PUBLIC_*` llega al navegador. `AUTH_SECRET`, `DATABASE_URL`, `MP_*`,
  `VAPID_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `SENTRY_AUTH_TOKEN` son de servidor.
- `.claude/` está en el `.gitignore` del repo: lo que tenga que viajar va en `docs/`, no ahí.

### Deploy

- **Push a `main` es deployar** (Vercel). No hay CI: `npm test` y `npm run e2e:local` en
  verde antes. Detalle, variables y rollback: `docs/agents/deploy.md`.
- `public/demo` se regenera desde `../demo` en cada build: no lo edites ahí.

### Tests

- Unit: `tests/unit/` con vitest, al lado de la lógica de `lib/`. Lógica nueva en `lib/`
  va con su test.
- Integración (`tests/integration/`) y E2E (`tests/e2e/`, Playwright, ~40 specs por flujo:
  anonimato, concurrencia, cuenta corriente, border cases) corren contra el Postgres de
  Docker con `npm run test:integration` y `npm run e2e:local`. **Sin el prefijo `:local`
  los E2E usan la base del `.env`**, o sea producción. `tests/cleanup.mjs` limpia lo que
  dejan.

## Comandos

```bash
cd web
npm run db:local:up        # Postgres en Docker (docker-compose.test.yml)
npm run db:local:setup     # prisma db push + seed contra Docker
npm run dev:local          # app en localhost:3000 contra la base de Docker
npm run dev                # app contra la base del .env (cuidado: puede ser prod)

npm test                   # unit (vitest)
npm run test:integration   # integración contra Docker
npm run e2e:local          # Playwright contra Docker
npm run db:demo            # pedidos de demo por estado (aborta contra prod)

git push                   # deploya en Vercel
```

## Dónde vive qué

```
web/app/           rutas: /, /login, /mecanico, /comercio, /repartidor, /admin, /terminos,
                   api/ (webhook de MP, auth); actions/ (server actions por área)
web/components/    UI por rol; globals.css es el design system
web/lib/           la lógica: orders, order-guards, mercadopago, credit (cuenta corriente),
                   alias, shipping + geo + zones (bandas por km, OSRM), push, telegram,
                   auth + session, upload (fotos a Supabase Storage), settings
web/prisma/        schema.prisma, seed.mjs, seed-demo.mjs, seed-zones.mjs
web/tests/         unit/, integration/, e2e/ (+ db.js, helpers.js), cleanup.mjs
web/scripts/       sync-demo (copia ../demo), with-test-env, backfill-zones
demo/              maqueta estática navegable, datos inventados, se sirve en /demo/
db/                schema.sql y rls.sql de la etapa anterior, referencia
docs/              ESTADO-MVP (ledger), reglas de negocio, modelo de datos, arquitectura,
                   plan de pruebas del equipo, handoff de diseño de los avisos
```

## Método de trabajo

- Un cambio a la vez, commits chicos, cada uno hace una cosa.
- Antes de tocar algo que ve un mecánico o un comercio en el piloto, decí en una línea
  **qué va a cambiar para ellos** y esperá el OK.
- Cuando el código se aparte de las reglas de negocio, la decisión va a `docs/ESTADO-MVP.md`
  el mismo día, en la sección que corresponda. Ese doc es el ledger del MVP.
- Lo que aprendas que le sirva a **otro** proyecto de Sistemik (Mercado Pago, Vercel,
  un caso borde de un proveedor) va a sistemik-skills con `/documentar`. Lo que es sólo de
  este repo va en este archivo.
- Al cerrar una sesión larga, dejá el estado en una nota corta: qué quedó deployado, qué
  no, y cuál es el único paso siguiente.

## Agent skills

Configuración de este repo que leen las skills (las de `mattpocock-skills` y las de
`sistemik-skills`). Cuando cambie algo, editá estos archivos a mano.

### Issue tracker

GitHub Issues de `Sistemik-ar/repuestos-al-toque`, con `gh`. Ver `docs/agents/issue-tracker.md`.
Las etiquetas de triage todavía no están creadas en este repo (`/setup-matt-pocock-skills`
las crea).

### Domain docs

Single-context: `GLOSSARY.md` y `docs/adr/` en la raíz, se crean cuando haga falta. Ver
`docs/agents/domain.md`.

### Base de datos

Postgres en Supabase vía Prisma, esquema por `db push`, local en Docker. Ver
`docs/agents/base-de-datos.md`.

### Deploy

Vercel; push a `main` deploya. Ver `docs/agents/deploy.md`.
