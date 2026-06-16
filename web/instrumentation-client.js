// Sentry (browser). Captura errores de JS/React del cliente. No-op si no hay DSN.
// Session Replay: graba la pantalla SOLO cuando hay un error -> sirve para ver "fallas visuales".
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV_LABEL || 'production',
    // Ruido que NO son bugs nuestros: fallas de red en mobile + errores de hidratación
    // (los disparan extensiones del navegador / traductor automático; React se recupera solo).
    ignoreErrors: ['Load failed', 'Failed to fetch', /hydrat/i, /Minified React error #(418|423|425)/],
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0, // graba la sesión cuando ocurre un error
    replaysSessionSampleRate: 0,   // no graba sesiones sin error (ahorra cuota)
    integrations: [Sentry.replayIntegration()],
  });
}

// Instrumentación de navegación del App Router (no-op si Sentry no se inicializó).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
