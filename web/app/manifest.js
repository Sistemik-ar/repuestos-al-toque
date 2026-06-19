// PWA: "agregar a pantalla de inicio" con nombre, color e ícono de marca
export default function manifest() {
  return {
    name: 'RepuestosAlToque',
    short_name: 'AlToque',
    description: 'Repuestos para tu taller, al toque · Bariloche',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0B0F',
    theme_color: '#6D28D9',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
