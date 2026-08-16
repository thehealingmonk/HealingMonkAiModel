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
  CheckCircle2,
} from 'lucide-react';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';
import BodyVRMHero from '@/components/common/BodyVRMHero';

export default function Home() {
  const navigate = useNavigate();
  // The AI assessment is now a subscription feature — CTAs lead to pricing.
  const subscribe = () => navigate('/pricing');

  const total = CLINICAL_ASSESSMENTS.length;

  return (
    <div>
      {/* ---------- LIGHT AI-SCAN HERO (full bleed) ---------- */}
      <section className="light-grid relative flex w-full items-center overflow-hidden md:min-h-[88vh]">
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-16 pt-28 md:grid-cols-2 md:gap-12 md:pb-20 md:pt-24">
          {/* Copy */}
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              Powered by MediaPipe Pose · 33-point body tracking
            </div>

            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
              Scan your posture &amp;{' '}
              <span className="glow-text">movement in minutes</span>
            </h1>

            <p className="mt-6 max-w-xl text-base text-slate-600 sm:text-lg md:mx-0">
              Stand in front of your camera and let our AI map 33 body landmarks in real time —
              then get a clear, clinical-style report and a personalized program.
            </p>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row md:justify-start">
              <button
                onClick={subscribe}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
              >
                <Zap className="h-5 w-5" />
                Subscribe &amp; Start Scan
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                to="/technology"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-6 py-3.5 text-base font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700"
              >
                See how the AI works
              </Link>
            </div>
            <span className="mt-4 block text-sm text-slate-500">
              Plans from ₹499 · Runs privately in your browser
            </span>
          </div>

          {/* Scan visual — interactive 3D girl (VRM), drag to rotate 360° */}
          <div data-reveal="scale">
            <BodyVRMHero />
          </div>
        </div>
      </section>

      {/* ---------- BODY ---------- */}
      <div className="mx-auto max-w-6xl px-6">
      {/* Feature grid */}
      <section className="grid gap-4 py-14 md:grid-cols-2 lg:grid-cols-4">
        <Feature i={0} icon={<ScanLine className="h-5 w-5" />} title="AI-Powered Analysis" desc="33-point pose detection scores your alignment frame by frame." />
        <Feature i={1} icon={<Zap className="h-5 w-5" />} title="Instant Results" desc="Get posture, mobility, and stability scores in seconds." />
        <Feature i={2} icon={<Gauge className="h-5 w-5" />} title="Personalized Programs" desc="Targeted routines matched to your specific findings." />
        <Feature i={3} icon={<ShieldCheck className="h-5 w-5" />} title="Private by Design" desc="Analysis runs on-device in your browser — nothing leaves you." />
      </section>

      {/* Clinic showcase — image on the left, description on the right */}
      <section className="mb-14 grid items-center gap-8 md:grid-cols-2">
        {/* Image slides in from the left; hover lifts the card and zooms the photo */}
        <div
          data-reveal="left"
          className="hm-lift group relative overflow-hidden rounded-2xl shadow-xl ring-1 ring-slate-200"
        >
          {/* Ambient glow that pulses behind the card */}
          <div className="scan-halo pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.25),transparent_65%)] blur-2xl" />

          {/* Placeholder clinic photo — swap the src for your own image later. */}
          <img
            src="https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80"
            alt="HealingMonk physiotherapy clinic"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/image.png';
            }}
            className="aspect-[4/3] h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-emerald-900/25 via-transparent to-transparent" />

          {/* Scan sweep — a soft beam that runs down the photo on hover */}
          <div className="pose-sweep pointer-events-none absolute inset-x-0 top-0 h-20 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="h-full w-full bg-[linear-gradient(180deg,transparent,rgba(45,212,191,0.35))]" />
            <div className="h-px w-full bg-emerald-300 shadow-[0_0_16px_3px_rgba(16,185,129,0.7)]" />
          </div>

          <div className="absolute bottom-4 left-4 rounded-xl border border-white/40 bg-white/80 px-4 py-2 backdrop-blur transition-transform duration-300 group-hover:-translate-y-1">
            <p className="text-[10px] font-medium uppercase tracking-widest text-emerald-600">HealingMonk</p>
            <p className="text-sm font-semibold text-slate-900">AI-assisted physiotherapy clinic</p>
          </div>
        </div>

        {/* Copy slides in from the right */}
        <div data-reveal="right">
          <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">Our clinic</p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Where AI precision meets hands-on care
          </h2>
          <p className="mt-4 text-slate-600">
            At HealingMonk, every assessment pairs on-device AI movement analysis with experienced
            physiotherapists. From your first scan to a personalized recovery program, your care is
            guided by data and delivered with a human touch.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              'Certified physiotherapists on staff',
              'AI-guided posture & movement screening',
              'Personalized recovery programs built around you',
              'Clinical-grade reports you can share with any doctor',
            ].map((item, i) => (
              <li
                key={item}
                data-reveal="left"
                style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
                className="group flex items-start gap-3 rounded-lg px-2 py-1.5 text-slate-700 transition-colors hover:bg-emerald-50"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500 transition-transform duration-200 group-hover:scale-125" />
                <span className="transition-transform duration-200 group-hover:translate-x-1">{item}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/about"
            className="hm-lift group mt-8 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-emerald-400 hover:text-emerald-700"
          >
            Learn more about us
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* Assessment library teaser */}
      <section data-reveal="zoom" className="glass-light mb-14 overflow-hidden rounded-2xl">
        <div className="grid gap-0 md:grid-cols-2">
          <div className="p-8 sm:p-10">
            <p className="text-sm font-medium uppercase tracking-widest text-emerald-600">Assessment library</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {total}+ clinical assessments, measured automatically
            </h2>
            <p className="mt-3 text-slate-600">
              Posture screens, range-of-motion tests, and functional movement checks — each mapped to a clinical
              measurement with normal → severe ranges, pain correlation, and recommended exercises.
            </p>
            <Link
              to="/assessments"
              className="group mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
            >
              Explore all assessments
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-slate-50/60 p-8 sm:p-10">
            {['Posture Assessment', 'Range of Motion', 'Functional Movement', 'Symmetry & Balance'].map((c) => (
              <div key={c} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 shadow-sm">
                <Activity className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                {c}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-slate-200 py-16">
        <h2 data-reveal="fade" className="text-center text-3xl font-bold tracking-tight text-slate-900">From camera to clarity in three steps</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <Step i={0} n="01" icon={<Camera className="h-5 w-5" />} title="Set up your camera" desc="Position yourself in frame — we guide you to the right distance and lighting." />
          <Step i={1} n="02" icon={<ScanLine className="h-5 w-5" />} title="Hold the pose" desc="The model tracks 33 body landmarks in real time and analyzes your alignment." />
          <Step i={2} n="03" icon={<Gauge className="h-5 w-5" />} title="Get your report" desc="See your scores, findings, and a personalized program to improve." />
        </div>
      </section>

      {/* CTA */}
      <section data-reveal="zoom" className="glass-light relative my-8 overflow-hidden rounded-2xl px-8 py-12 text-center">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-[100px]" />
        <p className="relative text-sm font-medium uppercase tracking-widest text-emerald-600">The HealingMonk Model</p>
        <h2 className="relative mx-auto mt-3 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Clinical-grade movement assessment, running entirely in the browser
        </h2>
        <div className="relative mt-8 grid gap-6 sm:grid-cols-3">
          <Stat value="33" label="Body landmarks tracked" />
          <Stat value="~60ms" label="Per-frame latency" />
          <Stat value="100%" label="On-device & private" />
        </div>
        <button
          onClick={subscribe}
          className="relative mt-10 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
        >
          View plans
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>
      </div>
    </div>
  );
}

function Feature({ i = 0, icon, title, desc }: { i?: number; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div
      data-reveal
      style={{ '--reveal-delay': `${i * 90}ms` } as React.CSSProperties}
      className="glass-light glass-light-lift group rounded-2xl p-6"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 transition-transform group-hover:scale-110">{icon}</div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

function Step({ i = 0, n, icon, title, desc }: { i?: number; n: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div
      data-reveal
      style={{ '--reveal-delay': `${i * 110}ms` } as React.CSSProperties}
      className="glass-light glass-light-lift relative rounded-2xl p-6"
    >
      <span className="absolute right-5 top-5 font-mono text-sm text-slate-300">{n}</span>
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">{icon}</div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-500">{desc}</p>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div data-reveal="scale">
      <p className="glow-text text-3xl font-bold sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}
