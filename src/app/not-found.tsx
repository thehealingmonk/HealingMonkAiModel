import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

// Real 404 for URLs the app doesn't serve (rendered by the catch-all page via
// notFound()). Server-rendered, so it needs no client JS.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6faf8] px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">404</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-3 text-slate-600">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Go to home
          </Link>
          <Link
            href="/assessments"
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            Explore assessments
          </Link>
        </div>
      </div>
    </main>
  );
}
