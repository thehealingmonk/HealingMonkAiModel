import { useState, useEffect } from 'react';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';
import { initializePoseLandmarker } from '@/lib/poseDetection';
import PoseIllustration from '@/components/common/PoseIllustration';
import PageShell from '@/components/common/PageShell';
import { CheckCircle2, ChevronLeft, AlertCircle, Activity, ArrowRight } from 'lucide-react';

interface Props {
  initial?: string[];
  onBack: () => void;
  onStart: (assessmentIds: string[]) => void;
}

export default function PositionSelect({ initial, onBack, onStart }: Props) {
  const defaults = CLINICAL_ASSESSMENTS.filter((a) => a.defaultSelected).map((a) => a.id);
  const [selected, setSelected] = useState<string[]>(initial?.length ? initial : defaults);
  const [error, setError] = useState('');

  // Warm up the (multi-MB) pose model now, while the doctor is picking positions,
  // so it's already downloaded and initialised by the time the capture screen
  // opens — the camera then starts tracking instantly instead of after a wait.
  useEffect(() => {
    initializePoseLandmarker().catch(() => {
      /* Non-fatal here; the capture screen retries and surfaces any error. */
    });
  }, []);

  const toggle = (id: string) => {
    setError('');
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectAll = () => setSelected(CLINICAL_ASSESSMENTS.map((a) => a.id));
  const clearAll = () => setSelected(defaults);

  const handleStart = () => {
    if (selected.length === 0) {
      setError('Please select at least one position to capture.');
      return;
    }
    // Keep the knowledge-base order so the full-body shot is captured first.
    const ordered = CLINICAL_ASSESSMENTS.filter((a) => selected.includes(a.id)).map((a) => a.id);
    onStart(ordered);
  };

  return (
    <PageShell step="Step 2 of 2 · Choose Positions" maxWidth="max-w-5xl">
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-800"
      >
        <ChevronLeft className="h-4 w-4" /> Back to patient details
      </button>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
          <Activity className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Select Positions</h1>
          <p className="text-slate-500">Tap the poses you want the AI to capture.</p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{selected.length} selected</p>
        <div className="flex gap-2 text-sm">
          <button onClick={selectAll} className="text-emerald-600 hover:underline">Select all</button>
          <span className="text-slate-300">|</span>
          <button onClick={clearAll} className="text-slate-500 hover:underline">Reset</button>
        </div>
      </div>

      <div className="mb-28 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {CLINICAL_ASSESSMENTS.map((a) => {
          const active = selected.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              className={`relative overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition-all ${
                active
                  ? 'border-emerald-500 ring-2 ring-emerald-200'
                  : 'border-slate-200 hover:border-emerald-300 hover:shadow-md'
              }`}
            >
              {a.defaultSelected && (
                <span className="absolute left-2 top-2 z-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                  Default
                </span>
              )}
              {active && (
                <span className="absolute right-2 top-2 z-10 rounded-full bg-emerald-500 p-0.5 text-white">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              )}
              <PoseIllustration pose={a.id} className="h-36 w-full bg-slate-50" />
              <div className="border-t border-slate-100 p-3">
                <p className="text-sm font-semibold leading-tight text-slate-900">{a.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{a.nameHi}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-600">{a.bodyRegion}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-600">{a.view} view</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {error ? (
            <span className="flex items-center gap-1 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" /> {error}
            </span>
          ) : (
            <span className="text-sm text-slate-500">
              {selected.length} position{selected.length === 1 ? '' : 's'} · full-body captured first
            </span>
          )}
          <button
            onClick={handleStart}
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
          >
            Start Assessment
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </PageShell>
  );
}
