# Base de datos: Postgres en Supabase vía Prisma, esquema por `prisma db push`

Cómo se toca la base de **este** repo. Reglas duras en `CLAUDE.md` § Base de datos.

| | |
| --- | --- |
| Motor | Postgres en **Supabase** (proyecto `ykfnnybsvarejkzejczp`, pooler `aws-1-us-west-2`). Los docs viejos dicen Neon: nunca se usó. Supabase JS (`lib/supabaseClient.js`, claves `NEXT_PUBLIC_SUPABASE_*`) es sólo para storage de fotos y realtime del lado del cliente; **los datos van por Prisma**. |
| ORM | Prisma 5, `web/prisma/schema.prisma` (snake_case en la base vía `@map`). `postinstall` corre `prisma generate`. |
| Esquema | **No hay carpeta `prisma/migrations`**: el esquema se aplica con `npm run db:push` (`prisma db push`). Contra producción, leer el diff que Prisma muestra antes de aceptar: un `db push` puede borrar columnas con datos. Pasar a `prisma migrate` el día que haya más de una persona tocando el esquema. |
| Local | Postgres en Docker: `npm run db:local:up` (`docker-compose.test.yml`), `npm run db:local:setup` (push + seed), `npm run db:local:reset`. Las variables salen de `.env.test` (commiteado, sin secretos) vía `scripts/with-test-env.mjs`. `npm run dev:local` levanta la app contra esa base. |
| Producción | `DATABASE_URL` en `web/.env` (ignorado). Usar el pooler en `:6543` para la app y `:5432` para `db push`/seeds. |
| Seeds | `npm run db:seed` (categorías, admin, básicos), `npm run db:seed-zones`, `npm run db:demo` (pedidos de demo por estado; **aborta si `DATABASE_URL` es de producción**, no saques esa guarda). |
| Acceso y seguridad | La app accede como dueño, **sin RLS**. La seguridad es `middleware.js` (rol por sección, cookie `rat_session` firmada con `AUTH_SECRET`) + ownership y guards de estado en cada server action (`lib/order-guards.js`). `db/schema.sql` y `db/rls.sql` son de la etapa Supabase-directo: referencia, no se aplican. |
| Verificar | `npm test` (vitest, unit). `npm run test:integration` contra el Postgres de Docker. `npm run e2e:local` (Playwright contra la base local; `tests/e2e/db.js` lee `DATABASE_URL` del entorno o del `.env`: **sin `e2e:local` los E2E le pegan a la base del `.env`**). |
