import { ReactNode } from 'react';
import { LotusMark } from '@/components/common/BrandLogo';

/**
 * The shared light "soft emerald" backdrop used across the public assessment
 * flow, so every screen reads as one continuous, clean website. Renders subtle
 * ambient glows on a near-white base, an optional slim header (brand + step),
 * and centers the page content.
 */
export default function PageShell({
  children,
  step,
  maxWidth = 'max-w-3xl',
}: {
  children: ReactNode;
  /** Optional right-aligned step label, e.g. "Step 1 of 2". */
  step?: string;
  /** Tailwind max-width class for the content column. */
  maxWidth?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f9f8] text-[#0f2340]">
      {/* Ambient soft glows — the home page's teal / mint tints. Plain radial
          gradients (no blur filter) so low-end phones scroll smoothly. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(45% 35% at 50% 0%, rgba(19,138,134,0.14), transparent 70%),' +
            'radial-gradient(35% 30% at 0% 40%, rgba(31,168,107,0.10), transparent 70%),' +
            'radial-gradient(40% 35% at 100% 100%, rgba(247,147,30,0.08), transparent 70%)',
        }}
      />

      {/* Brand header */}
      <header className={`relative z-10 mx-auto flex ${maxWidth} items-center justify-between px-6 py-5`}>
        <div className="flex items-center gap-2">
          <LotusMark size={38} />
          <span className="font-[Poppins] text-xl font-bold tracking-tight text-[#0b4f57]">
            Healing<span className="text-[#f7931e]">Monk</span>
          </span>
        </div>
        {step && (
          <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-500 backdrop-blur">
            {step}
          </span>
        )}
      </header>

      <main className={`relative z-10 mx-auto ${maxWidth} px-6 pb-16`}>{children}</main>
    </div>
  );
}

/** A clean white card matching the home-page feature cards. */
export function GlassCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}
