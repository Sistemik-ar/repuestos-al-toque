// Sentry (server). No-op si no hay DSN (local / sin configurar) -> nunca rompe el build ni prod.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV_LABEL || 'production',
    tracesSampleRate: 0.1,
  });
}
