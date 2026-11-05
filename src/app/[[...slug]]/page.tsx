import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ClientApp from '@/app/[[...slug]]/ClientApp';
import { ROUTE_META, PUBLIC_ROUTES, isAppPath, isIndexablePath, buildRouteMetadata, pageSchemas, jsonLd } from '@/lib/seo';

type Props = { params: { slug?: string[] } };

function pathOf(params: Props['params']): string {
  const parts = (params.slug ?? []).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s; // malformed %-escape — keep it raw (it simply won't match a route)
    }
  });
  return `/${parts.join('/')}`;
}

// NOTE: generateStaticParams for the marketing pages was tried (2026-10 audit,
// PERF-01) and cut TTFB from ~95 ms to ~10 ms locally, but in Next 14 it also
// turns EVERY other path of this catch-all into a year-long cached ISR page —
// unbounded cache growth from random URLs. Move the marketing pages to their
// own static routes before re-enabling it.

// Per-route metadata in the SERVER-rendered HTML, so crawlers (and link
// previews, which don't run JS) get each marketing page's own title,
// description and canonical — not the home page's. Every private screen
// (dashboards, reports, the paid flow, meeting rooms) is noindex.
export function generateMetadata({ params }: Props): Metadata {
  const path = pathOf(params);
  if (isIndexablePath(path)) return buildRouteMetadata(path);
  return {
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  };
}

// Optional catch-all: every non-/api path the SPA knows is served by this single
// page, which mounts the client-side SPA (react-router + MediaPipe). A hard
// refresh on any deep route (e.g. /admin, /r/xyz) therefore still boots the
// app, and react-router reads the URL to render the right screen. Unknown paths
// get a real 404.
export default function Page({ params }: Props) {
  const path = pathOf(params);
  if (!isAppPath(path)) notFound();
  const meta = isIndexablePath(path) ? ROUTE_META[path] : null;
  return (
    <>
      {/* WebPage + BreadcrumbList for this marketing page (Organization and
          WebSite are in the root layout). */}
      {meta && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(...pageSchemas(path)) }} />
      )}
      {/* SEO-02: the SPA is client-only, so without JavaScript a marketing page
          was an empty spinner. Crawlers/link previews that don't run JS now get
          the page's heading, summary and internal links — the same content the
          SPA renders, not a different page. */}
      {meta && (
        <noscript>
          <main>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
            <nav aria-label="Site">
              <ul>
                {PUBLIC_ROUTES.map((r) => (
                  <li key={r.path}>
                    <a href={r.path}>{ROUTE_META[r.path]?.title ?? r.path}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </main>
        </noscript>
      )}
      <ClientApp />
    </>
  );
}
