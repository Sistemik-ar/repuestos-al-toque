/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // La demo estática (carpeta demo/, copiada a public/demo en build) se sirve en /demo.
  // Los .html usan <base href="/demo/"> (inyectado por scripts/sync-demo.mjs) para los links.
  async rewrites() {
    return [
      { source: '/demo', destination: '/demo/login.html' },
      { source: '/demo/', destination: '/demo/login.html' },
    ];
  },
};
module.exports = nextConfig;
