import type { MetadataRoute } from 'next';
import { PUBLIC_ROUTES, absoluteUrl } from '@/lib/seo';

// Served at /sitemap.xml — only canonical, indexable marketing pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path),
    lastModified,
    changeFrequency: r.changefreq as MetadataRoute.Sitemap[number]['changeFrequency'],
    priority: r.priority,
  }));
}
