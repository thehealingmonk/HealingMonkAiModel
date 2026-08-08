import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Target, Dumbbell, Sparkles } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import PoseIllustration from '@/components/common/PoseIllustration';
import { CLINICAL_ASSESSMENTS, ClinicalAssessment } from '@/lib/clinicalKnowledge';

const FEASIBILITY_COLOR: Record<string, string> = {
  High: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function Assessments() {
  // Derive filter facets straight from the knowledge base so this page always
  // reflects exactly what the AI can measure — no hardcoded lists to drift.
  const categories = useMemo(
    () => Array.from(new Set(CLINICAL_ASSESSMENTS.map((a) => a.category))),
    []
  );
  const regions = useMemo(
    () => ['All', ...Array.from(new Set(CLINICAL_ASSESSMENTS.map((a) => a.bodyRegion)))],
    []
  );

  const [region, setRegion] = useState('All');

  const visible = useMemo(
    () => (region === 'All' ? CLINICAL_ASSESSMENTS : CLINICAL_ASSESSMENTS.filter((a) => a.bodyRegion === region)),
    [region]
  );

  return (
    <>
      <PageHeader
        eyebrow="Assessment Library"
        title={
          <>
            {CLINICAL_ASSESSMENTS.length}+ assessments the{' '}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              AI can measure
            </span>
          </>
        }
        subtitle="Posture screens, range-of-motion tests and functional movement checks — each with a clinical measurement, severity ranges, pain correlation and recommended exercises."
      >
        <Link
          to="/assessment"
          className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
        >
          Start an assessment
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </PageHeader>

      {/* Region filter */}
      <section className="mx-auto max-w-6xl px-6 pt-4">
        <div className="flex flex-wrap justify-center gap-2">
          {regions.map((r) => {
            const active = r === region;
            return (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-emerald-400 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-teal-300/50 hover:text-white'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </section>

      {/* Grouped by category (respecting the region filter) */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        {categories.map((cat) => {
          const group = visible.filter((a) => a.category === cat);
          if (group.length === 0) return null;
          return (
            <div key={cat} className="mb-12">
              <div className="mb-5 flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-white">{cat}</h2>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-300">
                  {group.length}
                </span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((a) => (
                  <AssessmentCard key={a.id} a={a} />
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}

function AssessmentCard({ a }: { a: ClinicalAssessment }) {
  return (
    <div className="glass-dark glass-dark-lift flex flex-col overflow-hidden rounded-2xl">
      <div className="relative">
        <PoseIllustration pose={a.id} className="h-40 w-full bg-slate-50" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-medium capitalize text-slate-600 shadow-sm backdrop-blur">
          {a.view} view
        </span>
        <span
          className={`absolute right-3 top-3 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
            FEASIBILITY_COLOR[a.aiFeasibility] ?? 'bg-slate-50 text-slate-600 border-slate-200'
          }`}
        >
          AI: {a.aiFeasibility}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold leading-tight text-white">{a.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{a.nameHi}</p>

        <div className="mt-3 space-y-2 text-sm">
          <Row icon={<Target className="h-4 w-4 text-emerald-400" />} label="Measures" value={`${a.measurementName} (${a.unit})`} />
          <Row icon={<Eye className="h-4 w-4 text-emerald-400" />} label="Body region" value={a.bodyRegion} />
          <Row icon={<Sparkles className="h-4 w-4 text-emerald-400" />} label="Pain link" value={`${a.painArea} · ${a.painCorrelation}`} />
        </div>

        {/* Normal → severe range strip */}
        <div className="mt-4 grid grid-cols-4 gap-1 text-center text-[10px]">
          <RangePill label="Normal" value={a.ranges.normal} color="#22c55e" />
          <RangePill label="Mild" value={a.ranges.mild} color="#eab308" />
          <RangePill label="Moderate" value={a.ranges.moderate} color="#f97316" />
          <RangePill label="Severe" value={a.ranges.severe} color="#ef4444" />
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
          <Dumbbell className="h-3.5 w-3.5 text-slate-500" />
          {a.exercises.length} recommended exercise{a.exercises.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <span>
        <span className="text-slate-500">{label}: </span>
        <span className="font-medium text-slate-200">{value}</span>
      </span>
    </div>
  );
}

function RangePill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-1.5">
      <p className="font-semibold" style={{ color }}>{label}</p>
      <p className="mt-0.5 text-slate-400">{value}</p>
    </div>
  );
}
