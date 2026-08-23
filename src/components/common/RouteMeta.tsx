import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ROUTE_META, SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION, absoluteUrl } from '@/lib/seo';

// Client-side head manager for the SPA. React-router changes the URL without a
// full page load, so Next's server metadata can't vary per screen. This keeps
// the document title, meta description, canonical link and robots directive in
// sync with the active route — public marketing pages are indexable with unique
// titles; every private/app route is marked noindex.
function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export default function RouteMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const known = ROUTE_META[pathname];
    const indexable = Boolean(known);

    const title = known?.title ?? `${SITE_NAME} · ${SITE_TAGLINE}`;
    const description = known?.description ?? SITE_DESCRIPTION;

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', indexable ? 'index,follow' : 'noindex,nofollow');

    // Open Graph / Twitter titles track the page too.
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', absoluteUrl(pathname));
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);

    // Canonical: point indexable pages at their own URL; non-indexable pages at
    // the site root so link equity isn't split across private URLs.
    upsertCanonical(indexable ? absoluteUrl(pathname) : absoluteUrl('/'));
  }, [pathname]);

  return null;
}
