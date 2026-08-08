import { ReactNode } from 'react';

/**
 * Shared dark "AI body-scan" hero for interior marketing pages.
 * Full-bleed navy panel with a tech grid, ambient emerald/cyan glow and a
 * thin scan beam — the same language as the home hero, so every page opens
 * consistently. The fixed nav floats over the top (hence the pt-* clearance).
 */
export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <section className="scan-hero scan-grid relative w-full overflow-hidden">
      {/* thin scan beam sweeping the header */}
      <div className="scan-sweep pointer-events-none absolute inset-x-0 top-0 h-40 opacity-40">
        <div className="h-full w-full bg-[linear-gradient(180deg,transparent,rgba(34,211,238,0.12)_70%,rgba(110,231,183,0.35))]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-32 text-center md:pb-20 md:pt-36">
        <p className="text-sm font-medium uppercase tracking-widest text-teal-300">{eyebrow}</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
          {title}
        </h1>
        {subtitle && <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">{subtitle}</p>}
        {children && <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div>}
      </div>
    </section>
  );
}
