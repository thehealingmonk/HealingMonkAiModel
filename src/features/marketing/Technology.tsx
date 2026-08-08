import { Link } from 'react-router-dom';
import {
  ScanLine,
  Waves,
  Ruler,
  ShieldCheck,
  Activity,
  Gauge,
  ArrowRight,
  Camera,
  FileText,
} from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import { SEVERITY_COLOR, SEVERITY_LABEL } from '@/lib/clinicalKnowledge';

const PIPELINE = [
  { icon: <Camera className="h-5 w-5" />, title: 'Camera frame', desc: 'Your webcam feed, processed live at ~10–30 FPS.' },
  { icon: <ScanLine className="h-5 w-5" />, title: '33 landmarks', desc: 'MediaPipe Pose locates 33 body points in 3D.' },
  { icon: <Waves className="h-5 w-5" />, title: 'Smoothing', desc: 'A One-Euro filter removes per-frame jitter.' },
  { icon: <Ruler className="h-5 w-5" />, title: 'Clinical geometry', desc: 'Plumb line, angles and symmetry are computed.' },
  { icon: <FileText className="h-5 w-5" />, title: 'Report', desc: 'Scores, severity and a program are generated.' },
];

const CAPABILITIES = [
  {
    icon: <ScanLine className="h-6 w-6" />,
    title: '33-point pose tracking',
    desc: 'Built on Google MediaPipe Pose (full model). It tracks the face, shoulders, elbows, wrists, hips, knees, ankles and feet in 3D — with automatic GPU acceleration and a CPU fallback so it runs on any device.',
  },
  {
    icon: <Waves className="h-6 w-6" />,
    title: 'Rock-steady, low-lag tracking',
    desc: 'Raw landmarks shimmer by a pixel or two every frame. A One-Euro adaptive filter smooths hard when you hold still (no jitter) and opens up instantly when you move (no lag) — so the deviation line stays stable.',
  },
  {
    icon: <Activity className="h-6 w-6" />,
    title: 'Clinical plumb line',
    desc: 'For front, side and back views the engine drops the reference vertical a physiotherapist uses, then checks whether anatomical points (ear, shoulder, hip, knee, ankle) sit on it — the live "position correct" verdict.',
  },
  {
    icon: <Ruler className="h-6 w-6" />,
    title: 'Angle & range-of-motion math',
    desc: 'Joint angles, tilts and ROM are computed from landmark geometry in real time — craniovertebral angle, shoulder flexion, knee flexion, pelvic tilt and more, each updating as you move.',
  },
  {
    icon: <Gauge className="h-6 w-6" />,
    title: 'Severity grading',
    desc: 'Every measurement is graded against clinical ranges into Normal → Mild → Moderate → Severe, colour-coded so findings that need attention stand out at a glance.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6" />,
    title: 'On-device & private',
    desc: 'The model and all analysis run inside your browser. Video frames never leave your device — there is no upload and no server-side processing of your body.',
  },
];

export default function Technology() {
  return (
    <>
      <PageHeader
        eyebrow="The Technology"
        title={
          <>
            The AI engine behind{' '}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              every scan
            </span>
          </>
        }
        subtitle="A real-time computer-vision pipeline that turns your camera into a clinical-style movement lab — entirely on-device."
      >
        <Link
          to="/assessment"
          className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
        >
          Try the live scan
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          to="/assessments"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 backdrop-blur transition-colors hover:border-teal-300/50 hover:bg-white/10"
        >
          Browse assessments
        </Link>
      </PageHeader>

      {/* Pipeline */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="glass-dark rounded-2xl p-6 shadow-2xl shadow-black/30 sm:p-8">
          <p className="text-center text-sm font-medium uppercase tracking-widest text-teal-300/80">
            How a frame becomes a finding
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-5">
            {PIPELINE.map((s, i) => (
              <div key={s.title} className="relative">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
                    {s.icon}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-white">{s.title}</p>
                  <p className="mt-1 text-xs text-slate-400">{s.desc}</p>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-slate-600 md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="glass-dark glass-dark-lift rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
                {c.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Severity scale */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="glass-dark rounded-2xl p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-white">The severity scale</h2>
          <p className="mt-2 text-sm text-slate-400">
            Every measured value is graded into one of four bands and colour-coded across the live overlay and the report.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['normal', 'mild', 'moderate', 'severe'] as const).map((sev) => (
              <div key={sev} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <span className="h-3.5 w-3.5 flex-shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[sev] }} />
                <span className="text-sm font-semibold text-slate-200">{SEVERITY_LABEL[sev]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
