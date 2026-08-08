import { Link } from 'react-router-dom';
import {
  ClipboardList,
  ListChecks,
  Camera,
  FileText,
  ArrowRight,
  Sun,
  Ruler,
  Shirt,
  CheckCircle2,
} from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';

const STEPS = [
  {
    icon: <ClipboardList className="h-5 w-5" />,
    title: 'Enter your details',
    desc: 'Add a few basics — age, height, weight and where it hurts. This tailors the report and the exercises you get.',
  },
  {
    icon: <ListChecks className="h-5 w-5" />,
    title: 'Choose your positions',
    desc: 'Pick from posture screens, range-of-motion tests and movement checks. The essential full-body views are pre-selected.',
  },
  {
    icon: <Camera className="h-5 w-5" />,
    title: 'Hold each pose',
    desc: 'The camera opens and 33 landmarks are tracked live. A plumb line and "position correct" prompt guide you before you capture.',
  },
  {
    icon: <FileText className="h-5 w-5" />,
    title: 'Get your report',
    desc: 'Every capture is scored and graded, with your photo, the measured angles, findings and a personalized exercise plan.',
  },
];

const TIPS = [
  { icon: <Sun className="h-5 w-5" />, title: 'Good lighting', desc: 'Face a light source; avoid strong backlight so your outline is clear.' },
  { icon: <Ruler className="h-5 w-5" />, title: 'Full body in frame', desc: 'Step back until your head and feet are both visible.' },
  { icon: <Shirt className="h-5 w-5" />, title: 'Fitted clothing', desc: 'Snug clothes let the model see your joints more accurately.' },
  { icon: <CheckCircle2 className="h-5 w-5" />, title: 'Stand naturally', desc: "Don't correct your posture — let the scan capture how you really stand." },
];

export default function HowItWorks() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title={
          <>
            From camera to a clear plan, in{' '}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              four steps
            </span>
          </>
        }
        subtitle="The whole flow takes just a few minutes and runs entirely in your browser."
      >
        <Link
          to="/assessment"
          className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
        >
          Start now
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </PageHeader>

      {/* Steps */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <div className="space-y-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass-dark flex gap-5 rounded-2xl p-6">
              <div className="flex flex-col items-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
                  {s.icon}
                </div>
                {i < STEPS.length - 1 && <div className="mt-2 w-px flex-1 bg-white/10" />}
              </div>
              <div className="pb-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-teal-300/70">STEP {i + 1}</span>
                </div>
                <h3 className="mt-1 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Tips for a good scan */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="glass-dark rounded-2xl p-6 shadow-2xl shadow-black/30 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-white">Tips for an accurate scan</h2>
          <p className="mt-2 text-sm text-slate-400">A few seconds of setup makes the AI measurements noticeably steadier.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TIPS.map((t) => (
              <div key={t.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
                  {t.icon}
                </div>
                <h3 className="mt-3 font-semibold text-white">{t.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
