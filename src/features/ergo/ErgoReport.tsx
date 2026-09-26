import { ChevronLeft, RotateCcw, AlertTriangle, ListChecks } from 'lucide-react';
import { ErgoResult } from '@/lib/ergo/ergoTypes';
import { RISK_COLOR, RISK_LABEL, ENVIRONMENTS, TASKS } from '@/lib/ergo/ergoKnowledge';
import { ErgoCaptures } from './ergoTypes';

interface Props {
  result: ErgoResult;
  captures: ErgoCaptures;
  onBack: () => void;
  onRestart: () => void;
}

function RiskPill({ band }: { band: ErgoResult['overall'] }) {
  return (
    <span
      className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full text-white"
      style={{ backgroundColor: RISK_COLOR[band] }}
    >
      {RISK_LABEL[band]}
    </span>
  );
}

export default function ErgoReport({ result, captures, onBack, onRestart }: Props) {
  const envLabel = ENVIRONMENTS.find((e) => e.id === result.environment)?.label ?? result.environment;
  const taskLabel = TASKS.find((t) => t.id === result.task)?.label ?? result.task;
  const shots = [captures.side, captures.front].filter(Boolean);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button
            onClick={onRestart}
            className="text-slate-400 hover:text-white text-sm flex items-center gap-1"
          >
            <RotateCcw className="w-4 h-4" /> New assessment
          </button>
        </div>

        {/* Headline */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">Overall ergonomic risk</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-4xl font-bold" style={{ color: RISK_COLOR[result.overall] }}>
                  {RISK_LABEL[result.overall]}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1">
                {envLabel} · {taskLabel} · methods: {result.methods.join(', ')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-bold" style={{ color: RISK_COLOR[result.overall] }}>
                {result.overallScore}
              </div>
              <p className="text-xs text-slate-500">risk index / 100</p>
            </div>
          </div>
          {result.confidence < 0.6 && (
            <p className="mt-4 text-xs text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Low pose confidence — recapture with the full body clearly in frame for a more reliable result.
            </p>
          )}
        </div>

        {/* Standard scores */}
        <section className="mt-6 grid sm:grid-cols-3 gap-3">
          {result.rula && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-400">RULA (upper limb)</p>
              <p className="text-2xl font-bold mt-1">{result.rula.grandScore}<span className="text-sm text-slate-500">/7</span></p>
              <div className="mt-2"><RiskPill band={result.rula.band} /></div>
              <p className="text-xs text-slate-400 mt-2">{result.rula.message}</p>
            </div>
          )}
          {result.reba && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-400">REBA (whole body)</p>
              <p className="text-2xl font-bold mt-1">{result.reba.grandScore}<span className="text-sm text-slate-500">/15</span></p>
              <div className="mt-2"><RiskPill band={result.reba.band} /></div>
              <p className="text-xs text-slate-400 mt-2">{result.reba.message}</p>
            </div>
          )}
          {result.niosh && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-slate-400">NIOSH lifting</p>
              <p className="text-2xl font-bold mt-1">LI {result.niosh.liftingIndex}</p>
              <div className="mt-2"><RiskPill band={result.niosh.band} /></div>
              <p className="text-xs text-slate-400 mt-2">RWL {result.niosh.rwlKg} kg · {result.niosh.message}</p>
            </div>
          )}
        </section>

        {/* Category breakdown */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Risk by category</h2>
          <div className="space-y-2">
            {result.categories.map((c) => (
              <div key={c.category} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.category}</span>
                  <RiskPill band={c.band} />
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${['negligible', 'low', 'medium', 'high', 'very-high'].indexOf(c.band) * 25}%`,
                      backgroundColor: RISK_COLOR[c.band],
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">{c.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Primary risk factors */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Primary risk factors
          </h2>
          <ul className="space-y-1.5">
            {result.primaryFactors.map((f, i) => (
              <li key={i} className="text-sm text-slate-200 flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Recommendations */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-400" /> Corrective action plan
          </h2>
          <div className="space-y-2">
            {result.recommendations.map((r, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${
                    r.priority === 1
                      ? 'bg-red-500/20 text-red-300'
                      : r.priority === 2
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-500/20 text-slate-300'
                  }`}
                >
                  {r.priority === 1 ? 'IMMEDIATE' : r.priority === 2 ? 'RECOMMENDED' : 'MONITOR'}
                </span>
                <p className="text-sm text-slate-200">{r.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Captured frames */}
        {shots.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Captured posture</h2>
            <div className="grid grid-cols-2 gap-3">
              {shots.map((s) => (
                <div key={s!.view} className="rounded-xl overflow-hidden border border-white/10">
                  <img src={s!.imageData} alt={`${s!.view} view`} className="w-full object-cover" />
                  <div className="px-3 py-2 text-xs text-slate-400 capitalize bg-white/5">{s!.view} view</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 text-[11px] text-slate-500">
          Generated {new Date(result.generatedAt).toLocaleString()}. Scores follow the published RULA, REBA and
          NIOSH worksheets. This is a screening tool and does not replace a formal ergonomic evaluation.
        </p>
      </div>
    </div>
  );
}
