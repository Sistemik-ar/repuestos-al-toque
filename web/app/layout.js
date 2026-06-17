import './globals.css';
import Toaster from '@/components/Toaster';
import EnvBadge from '@/components/EnvBadge';

const SITE = 'https://repuestosaltoque.com.ar';

export const metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: 'RepuestosAlToque · Repuestos para tu taller en 10 minutos · Bariloche',
    template: '%s · RepuestosAlToque',
  },
  description:
    'Pedí el repuesto que necesitás y recibí cotizaciones de las casas de repuestos de Bariloche en 10 minutos. Pagás online y te lo llevamos al taller. Para mecánicos, repuesteros y repartidores.',
  keywords: ['repuestos', 'autopartes', 'Bariloche', 'taller mecánico', 'casa de repuestos', 'cotización de repuestos', 'envío de repuestos', 'mecánicos'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: SITE,
    siteName: 'RepuestosAlToque',
    title: 'RepuestosAlToque · Repuestos para tu taller en 10 minutos',
    description: 'Cotizaciones de las casas de repuestos de Bariloche en 10 minutos, pago online y envío al taller.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RepuestosAlToque · Repuestos para tu taller en 10 minutos',
    description: 'Cotizaciones de repuestos en 10 minutos, pago online y envío al taller. Bariloche.',
  },
  robots: { index: true, follow: true },
  applicationName: 'RepuestosAlToque',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0B0B0F',
};

// Datos estructurados para Google (negocio local)
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'RepuestosAlToque',
  description: 'Marketplace de repuestos para talleres mecánicos: cotizaciones en 10 minutos, pago online y envío al taller.',
  url: SITE,
  image: `${SITE}/opengraph-image.jpg`,
  address: { '@type': 'PostalAddress', addressLocality: 'San Carlos de Bariloche', addressRegion: 'Río Negro', addressCountry: 'AR' },
  areaServed: 'San Carlos de Bariloche',
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: el script de zoom de abajo muta <html> antes de hidratar,
    // y algunas extensiones del navegador inyectan atributos en <body>. Evita el falso "hydration mismatch".
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica el tamaño de texto guardado antes de pintar (evita parpadeo). Lo setea FontScale. */}
        <script dangerouslySetInnerHTML={{ __html: `try{var s=localStorage.getItem('rat_ui_scale');if(s&&s!=='1')document.documentElement.style.zoom=s;}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body suppressHydrationWarning>
        <EnvBadge />
        <Toaster />
        {children}
      </body>
    </html>
  );
}
