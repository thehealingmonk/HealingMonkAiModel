import { Link } from 'react-router-dom';
import { ShieldCheck, HeartPulse, Lock, Stethoscope, ArrowRight, ShieldAlert } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';

const VALUES = [
  {
    icon: <HeartPulse className="h-6 w-6" />,
    title: 'Access to movement screening',
    desc: 'Objective posture and mobility screening should not require expensive equipment or a clinic visit — a camera is enough to start the conversation.',
  },
  {
    icon: <Stethoscope className="h-6 w-6" />,
    title: 'Grounded in clinical practice',
    desc: 'Each assessment maps to an established measurement — craniovertebral angle, plumb-line alignment, ROM norms — drawn from physiotherapy references and clinical experience.',
  },
  {
    icon: <Lock className="h-6 w-6" />,
    title: 'Private by design',
    desc: 'The pose model runs on-device. Your video is analyzed in the browser and never uploaded — your body stays yours.',
  },
  {
    icon: <ShieldCheck className="h-6 w-6" />,
    title: 'Honest about limits',
    desc: 'AI camera estimates are a screening aid, not a diagnosis. We surface confidence and always defer final judgement to a treating clinician.',
  },
];

export default function About() {
  return (
    <>
      <PageHeader
        eyebrow="About HealingMonk"
        title={
          <>
            Making movement assessment{' '}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              simple and accessible
            </span>
          </>
        }
        subtitle="HealingMonk turns any camera into a clinical-style movement lab — helping people understand their posture and mobility, and helping clinicians screen faster."
      />

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="glass-dark glass-dark-lift rounded-2xl p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
                {v.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="flex gap-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6">
          <ShieldAlert className="h-6 w-6 flex-shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-200">Not a medical device</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-100/80">
              All angles, scores and severities are produced automatically by camera-based AI pose estimation. They are
              approximate estimates, may not be accurate, and are <b>not medically verified</b>. This tool is for
              screening and education only and must not be treated as a clinical diagnosis. Always consult a qualified
              clinician for medical advice.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="glass-dark relative overflow-hidden rounded-2xl px-8 py-12 text-center shadow-2xl shadow-black/30">
          <div className="scan-halo pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[100px]" />
          <h2 className="relative mx-auto max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Ready to see how you move?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-slate-300">
            Run a free assessment in your browser — no download, no sign-up, nothing leaves your device.
          </p>
          <Link
            to="/assessment"
            className="group relative mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.03]"
          >
            Start Free Assessment
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </>
  );
}
