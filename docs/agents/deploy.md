# Deploy: Vercel (`web/`), push a `main` deploya

Dónde corre **este** repo y cómo se sube. Reglas duras en `CLAUDE.md` § Deploy.

| | |
| --- | --- |
| Hosting | Vercel, proyecto con raíz en `web/`, región `pdx1` (`web/vercel.json`). Dominio `repuestosaltoque.com.ar`. |
| Cómo se sube | **Push a `main`** → Vercel deploya. Las otras ramas (`staging`) generan previews. No hay CI en GitHub: `npm test` y `npm run e2e:local` antes de pushear. |
| Demo | `/demo/` es la demo estática de `../demo`, copiada a `web/public/demo` por `scripts/sync-demo.mjs` en `predev` y `prebuild` (inyecta `<base href="/demo/">`). No editar `public/demo`, se pisa. |
| Variables en Vercel | `DATABASE_URL`, `AUTH_SECRET`, `MP_ACCESS_TOKEN` (y `MP_TEST_ACCESS_TOKEN` para pruebas, `MP_WEBHOOK_URL`), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_UPLOAD_BUCKET`, `NEXT_PUBLIC_UPLOAD_PREFIX`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `TELEGRAM_BOT_TOKEN`, `APP_URL`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. Sólo `NEXT_PUBLIC_*` llega al navegador. |
| Local | `web/.env` (ignorado) con las reales; `web/.env.test` (commiteado) con la base de Docker. |
| Mercado Pago | Cobro **centralizado** en la cuenta propia, sin split. Webhook idempotente; `x-signature` no se valida, se consulta el pago real a MP antes de confirmar. Con `MP_TEST_ACCESS_TOKEN` cargado, los avisos de Telegram y push marcan que es prueba. |
| Avisos | Telegram (`lib/telegram.js`, grupo "Pedidos RAT", el bot detecta el grupo al agregarlo) y Web Push (`lib/push.js`, VAPID). |
| Errores | Sentry (`sentry.*.config.js`, `instrumentation.js`). |
| Volver atrás | Vercel → Deployments → Promote de un deploy anterior, o revertir el commit y pushear. |
| Cuentas | `sistemik-skills/docs/estado-sistemik.md` § Vercel, § Supabase, § Mercado Pago. |
