const SITE = 'https://www.repuestosaltoque.com.ar';

export default function sitemap() {
  return [
    { url: `${SITE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE}/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE}/terminos`, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
