import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
// Mappingg design system (dashboards + public header) — loaded after Tailwind.
import '@/styles/mappingg-theme.css';
import {
  SITE,
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  DEFAULT_OG_IMAGES,
  organizationSchema,
  websiteSchema,
  jsonLd,
} from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'posture assessment',
    'AI posture analysis',
    'movement assessment',
    'physiotherapy',
    'pose detection',
    'posture correction',
    'HealingMonk',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // Canonical is set per route in app/[[...slug]]/page.tsx (never inherited:
  // a site-wide '/' canonical told Google every page was a copy of the home page).
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: SITE_NAME },
  // Standard (non-Apple) PWA capability meta — pairs with the Apple one above so
  // modern browsers stop warning that `apple-mobile-web-app-capable` is deprecated.
  other: { 'mobile-web-app-capable': 'yes' },
  // Favicon comes from app/icon.svg (Next file convention). The Apple touch icon
  // and PWA manifest icons are the pre-rendered brand PNGs in /public.
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
  // Google Search Console ownership check — renders
  // <meta name="google-site-verification" content="..."> in every page's <head>.
  verification: {
    google: 'SCP_r7DMj7G12kG-fiEpMBAWy6VrktfO8srLr3yqcAk',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: SITE.locale,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: DEFAULT_OG_IMAGES,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: DEFAULT_OG_IMAGES,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

// Organization + WebSite structured data (same builders as Mappingg's
// lib/seo/schema.ts), rendered on the server so search engines see it even
// though the app itself is a client-only SPA.
const siteJsonLd = jsonLd(organizationSchema(), websiteSchema());

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Inter: a clean, professional variable UI typeface */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Warm up the two hosts the MediaPipe pose engine downloads from (the
            WASM runtime + the model .task file) so DNS/TLS is already done by the
            time the assessment opens the camera — the AI starts tracking sooner. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://storage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        <link rel="dns-prefetch" href="https://storage.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: siteJsonLd }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
