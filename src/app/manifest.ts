import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/seo';

// Web App Manifest — makes HealingMonk installable as a mobile/desktop app
// ("Add to Home Screen"). Served by Next at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — AI Posture & Movement Assessment`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6faf8',
    theme_color: '#10b981',
    icons: [
      { src: '/image.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/image.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/image.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
