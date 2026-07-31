import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Camera,
  Gauge,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Zap,
  Activity,
} from 'lucide-react';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';

export default function Home() {
  const navigate = useNavigate();
  // The AI assessment is now a subscription feature — CTAs lead to pricing.
  const subscribe = () => navigate('/pricing');

  const total = CLINICAL_ASSESSMENTS.length;

  return (
    <div className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="flex flex-col items-center pt-16 pb-14 text-center md:pt-24">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
          Powered by MediaPipe Pose · 33-point body tracking
        </div>

        <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Assess your posture &amp; movement{' '}
          <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
            in minutes
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-base text-slate-500 sm:text-lg">
          Stand in front of your camera and let our AI analyze your alignment, mobility, and stability —
          then get a clear, clinical-style report and a personalized program.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          {/* Free assessment CTA — disabled; the AI assessment is now a paid subscription.
          <button
            onClick={start}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
          >
            <Zap className="h-5 w-5" />
            Start Free Assessment
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </button>
          */}
          <button
            onClick={subscribe}
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
          >
            <Zap className="h-5 w-5" />
            Subscribe &amp; Start Assessment
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </button>
          <Link
            to="/technology"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-base font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-300"
          >
            See how the AI works
          </Link>
        </div>
        <span className="mt-3 text-sm text-slate-400">Plans from ₹499 · Runs privately in your browser</span>

        {/* Product mock card */}
        <div className="mt-16 w-full max-w-3xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ScanLine className="h-4 w-4 text-emerald-500" />
                  Live posture analysis
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  Tracking 33 / 33 landmarks
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
                <ScoreTile label="Posture" value={86} />
                <ScoreTile label="Mobility" value={74} />
                <ScoreTile label="Stability" value={91} />
              </div>
              <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-left">
                <p className="text-xs uppercase tracking-wide text-slate-400">Overall Score</p>
                <div className="mt-1 flex items-end gap-2">
                  <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-4xl font-bold text-transparent">
                    84
                  </span>
                  <span className="mb-1 text-sm text-slate-500">/ 100 · Good alignment</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="grid gap-4 pb-14 md:grid-cols-2 lg:grid-cols-4">
        <Feature i={0} icon={<ScanLine className="h-5 w-5" />} title="AI-Powered Analysis" desc="33-point pose detection scores your alignment frame by frame." />
        <Feature i={1} icon={<Zap className="h-5 w-5" />} title="Instant Results" desc="Get posture, mobility, and stability scores in seconds." />
        <Feature i={2} icon={<Gauge className="h-5 w-5" />} title="Personalized Programs" desc="Targeted routines matched to your specific findings." />
        <Feature i={3} icon={<ShieldCheck className="h-5 w-5" />} title="Private by Design" desc="Analysis runs on-device in your browser — nothing leaves you." />
      </section>

      {/* Assessment library teaser */}
      <section data-reveal="zoom" className="mb-14 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="p-8 sm:p-10">
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">Assessment library</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              {total}+ clinical assessments, measured automatically
            </h2>
            <p className="mt-3 text-slate-500">
              Posture screens, range-of-motion tests, and functional movement checks — each mapped to a clinical
              measurement with normal → severe ranges, pain correlation, and recommended exercises.
            </p>
            <Link
              to="/assessments"
              className="group mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
            >
              Explore all assessments
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-8 sm:p-10">
            {['Posture Assessment', 'Range of Motion', 'Functional Movement', 'Symmetry & Balance'].map((c) => (
              <div key={c} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700">
                <Activity className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                {c}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-200 py-16">
        <h2 data-reveal="fade" className="text-center text-3xl font-bold tracking-tight">From camera to clarity in three steps</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <Step i={0} n="01" icon={<Camera className="h-5 w-5" />} title="Set up your camera" desc="Position yourself in frame — we guide you to the right distance and lighting." />
          <Step i={1} n="02" icon={<ScanLine className="h-5 w-5" />} title="Hold the pose" desc="The model tracks 33 body landmarks in real time and analyzes your alignment." />
          <Step i={2} n="03" icon={<Gauge className="h-5 w-5" />} title="Get your report" desc="See your scores, findings, and a personalized program to improve." />
        </div>
      </section>

      {/* CTA */}
      <section data-reveal="zoom" className="my-8 rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-8 py-12 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">The HealingMonk Model</p>
        <h2 className="mx-auto mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
          Clinical-grade movement assessment, running entirely in the browser
        </h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          <Stat value="33" label="Body landmarks tracked" />
          <Stat value="~60ms" label="Per-frame latency" />
          <Stat value="100%" label="On-device & private" />
        </div>
        <button
          onClick={subscribe}
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
        >
          View plans
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
    </div>
  );
}

function ScoreTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Feature({ i = 0, icon, title, desc }: { i?: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div
      data-reveal
      style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
      className="hm-lift group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-transform group-hover:scale-110">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

function Step({ i = 0, n, icon, title, desc }: { i?: number; n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div
      data-reveal
      style={{ '--reveal-delay': `${i * 110}ms` } as React.CSSProperties}
      className="hm-lift relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:border-emerald-300"
    >
      <span className="absolute right-5 top-5 font-mono text-sm text-slate-300">{n}</span>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">{icon}</div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div data-reveal="scale">
      <p className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}
