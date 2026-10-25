// Central SEO configuration shared by the server metadata layer (app/layout,
// app/sitemap, app/robots) and the client-side per-route <RouteMeta>.
//
// The canonical production origin MUST be set via NEXT_PUBLIC_SITE_URL in the
// deployment environment (e.g. https://healingmonk.com). It falls back to the
// public APP base URL, then localhost for dev.

function normalizeOrigin(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * The live production origin. Used whenever a production build has no
 * NEXT_PUBLIC_SITE_URL, so a missing deployment variable can never again
 * publish http://localhost:3000 as the canonical/sitemap origin. It is the same
 * on the server and in the browser bundle (APP_BASE_URL is server-only, so it
 * cannot be part of this chain without the two disagreeing).
 */
export const PRODUCTION_ORIGIN = 'https://ai.thehealingmonk.in';

export const SITE_URL = normalizeOrigin(
  process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === 'production'
      ? PRODUCTION_ORIGIN
      : process.env.APP_BASE_URL || 'http://localhost:3000'),
);

/**
 * Base URL for links inside emails (report, meeting, sign-in). Server-only:
 * prefers APP_BASE_URL, else the canonical site origin — never empty, so a
 * missing variable no longer silently drops links or fails invites.
 */
export function appBaseUrl(): string {
  return normalizeOrigin(process.env.APP_BASE_URL || SITE_URL);
}

export const SITE_NAME = 'HealingMonk';

export const SITE_TAGLINE = 'AI Posture & Movement Assessment';

export const SITE_DESCRIPTION =
  'AI-powered posture and movement assessment. 33-point on-device pose tracking scores your alignment, mobility and stability — with a personalized program from HealingMonk.';

/** Absolute URL for a path relative to the canonical origin. */
export function absoluteUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${clean === '/' ? '' : clean}` || SITE_URL;
}

/** Public, indexable marketing pages (drives the sitemap). */
export const PUBLIC_ROUTES: { path: string; changefreq: string; priority: number }[] = [
  { path: '/', changefreq: 'weekly', priority: 1.0 },
  { path: '/technology', changefreq: 'monthly', priority: 0.8 },
  { path: '/assessments', changefreq: 'monthly', priority: 0.8 },
  { path: '/how-it-works', changefreq: 'monthly', priority: 0.7 },
  { path: '/pricing', changefreq: 'monthly', priority: 0.9 },
  { path: '/about', changefreq: 'monthly', priority: 0.6 },
];

/** Per-route titles + descriptions for the client SPA (see RouteMeta). */
export const ROUTE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  '/technology': {
    title: `Technology · ${SITE_NAME}`,
    description:
      'How HealingMonk works: 33-point MediaPipe pose tracking runs entirely on-device to analyse posture, mobility and stability in real time — no video ever leaves your browser.',
  },
  '/assessments': {
    title: `Assessments · ${SITE_NAME}`,
    description:
      'Explore HealingMonk clinical posture assessments — from standing alignment to functional movement — each scored against evidence-based reference postures.',
  },
  '/how-it-works': {
    title: `How it works · ${SITE_NAME}`,
    description:
      'Capture your posture in a few guided photos, get an instant AI-scored report, and follow a personalized corrective program reviewed by a clinician.',
  },
  '/pricing': {
    title: `Pricing · ${SITE_NAME}`,
    description:
      'Simple pricing for the HealingMonk AI posture assessment and clinic platform. Subscribe to unlock full assessments and personalized programs.',
  },
  '/about': {
    title: `About · ${SITE_NAME}`,
    description:
      'HealingMonk combines physiotherapy expertise with on-device AI to make objective posture and movement assessment accessible to everyone.',
  },
};

// Every URL the client SPA can render. The server catch-all page uses this to
// answer anything else with a real 404 (instead of booting the SPA, which used to
// silently redirect unknown URLs to "/" — a soft-404 that search engines punish).
const APP_PATH_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/(technology|assessments|how-it-works|about|pricing|login|ergo)$/,
  /^\/assessment(\/(positions|capture|report))?$/,
  /^\/assessment\/report\/[^/]+$/,
  /^\/r\/[^/]+$/,
  /^\/m\/[^/]+$/,
  // Role dashboards own their whole URL space (their routers handle sub-paths).
  /^\/(admin|doctor|reception|patient)(\/.*)?$/,
];

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PATTERNS.some((re) => re.test(pathname));
}

/** Only the public marketing pages are indexable; every other app screen is noindex. */
export function isIndexablePath(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROUTE_META, pathname);
}
