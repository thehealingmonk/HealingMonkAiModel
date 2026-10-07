import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ClientApp from '@/app/[[...slug]]/ClientApp';
import { ROUTE_META, isAppPath, isIndexablePath, absoluteUrl } from '@/lib/seo';

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

// Per-route metadata in the SERVER-rendered HTML, so crawlers (and link
// previews, which don't run JS) get each marketing page's own title,
// description and canonical — not the home page's. Every private screen
// (dashboards, reports, the paid flow, meeting rooms) is noindex.
export function generateMetadata({ params }: Props): Metadata {
  const path = pathOf(params);
  if (isIndexablePath(path)) {
    const meta = ROUTE_META[path];
    const url = absoluteUrl(path);
    return {
      title: { absolute: meta.title },
      description: meta.description,
      alternates: { canonical: url },
      openGraph: { title: meta.title, description: meta.description, url },
      twitter: { title: meta.title, description: meta.description },
    };
  }
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
  if (!isAppPath(pathOf(params))) notFound();
  return <ClientApp />;
}
