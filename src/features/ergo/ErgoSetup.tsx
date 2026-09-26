import { useMemo, useState } from 'react';
import { ChevronLeft, ArrowRight, Building2, ClipboardList } from 'lucide-react';
import { ErgoEnvironment, ErgoTask } from '@/lib/ergo/ergoTypes';
import { ENVIRONMENTS, TASKS, methodsForTask } from '@/lib/ergo/ergoKnowledge';

interface Props {
  environment: ErgoEnvironment;
  task: ErgoTask;
  onChange: (env: ErgoEnvironment, task: ErgoTask) => void;
  onContinue: () => void;
  onExit: () => void;
}

export default function ErgoSetup({ environment, task, onChange, onContinue, onExit }: Props) {
  const [env, setEnv] = useState<ErgoEnvironment>(environment);
  const [tsk, setTsk] = useState<ErgoTask>(task);

  const methods = useMemo(() => methodsForTask(env, tsk), [env, tsk]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={onExit} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 mb-6">
          <ChevronLeft className="w-4 h-4" /> Exit ErgoAI
        </button>

        <h1 className="text-2xl font-bold tracking-tight">ErgoAI — Workplace Ergonomic Assessment</h1>
        <p className="text-slate-400 text-sm mt-1">
          Select the environment and task. The engine picks the recognised method(s) automatically.
        </p>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
            <Building2 className="w-4 h-4 text-emerald-400" /> Environment
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ENVIRONMENTS.map((e) => (
              <button
                key={e.id}
                onClick={() => setEnv(e.id)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  env === e.id
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="font-semibold text-sm">{e.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{e.hint}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
            <ClipboardList className="w-4 h-4 text-emerald-400" /> Task
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TASKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTsk(t.id)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  tsk === t.id
                    ? 'border-emerald-400 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="font-semibold text-sm">{t.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{t.hint}</div>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-slate-400">Methods that will be applied</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {methods.map((m) => (
              <span key={m} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/30">
                {m}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            onChange(env, tsk);
            onContinue();
          }}
          className="mt-8 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-emerald-500/30"
        >
          Continue to capture <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
