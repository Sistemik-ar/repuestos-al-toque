// robots.txt — indexa lo público, bloquea paneles privados y APIs
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/mecanico', '/comercio', '/repartidor', '/api/', '/demo/'],
    },
    sitemap: 'https://repuestosaltoque.com.ar/sitemap.xml',
  };
}
