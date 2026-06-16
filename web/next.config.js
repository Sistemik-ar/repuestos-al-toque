const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: { instrumentationHook: true }, // habilita instrumentation.js (Sentry server/edge) en Next 14
  // La demo estática (carpeta demo/, copiada a public/demo en build) se sirve en /demo.
  // Los .html usan <base href="/demo/"> (inyectado por scripts/sync-demo.mjs) para los links.
  async rewrites() {
    return [
      { source: '/demo', destination: '/demo/login.html' },
      { source: '/demo/', destination: '/demo/login.html' },
    ];
  },
};

// Sin SENTRY_AUTH_TOKEN NO sube sourcemaps (no rompe el build); sin DSN los SDK quedan inertes.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  disableLogger: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
