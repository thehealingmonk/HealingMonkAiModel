import { useState } from 'react';
import { ChevronLeft, ArrowRight, Sparkles } from 'lucide-react';
import { ErgoManualInputs, ErgoTask } from '@/lib/ergo/ergoTypes';
import { taskNeedsLiftInputs } from '@/lib/ergo/ergoKnowledge';

interface Props {
  task: ErgoTask;
  initial: ErgoManualInputs;
  onBack: () => void;
  onGenerate: (manual: ErgoManualInputs) => void;
}

// The non-visual factors the standards require but the camera can't see. Lifting
// tasks additionally need the NIOSH origin/frequency fields.
export default function ErgoInputs({ task, initial, onBack, onGenerate }: Props) {
  const [m, setM] = useState<ErgoManualInputs>(initial);
  const needsLift = taskNeedsLiftInputs(task);

  const set = <K extends keyof ErgoManualInputs>(k: K, v: ErgoManualInputs[K]) =>
    setM((prev) => ({ ...prev, [k]: v }));

  const num = (v: string) => (v === '' ? 0 : Number(v));

  const numberField = (
    label: string,
    key: keyof ErgoManualInputs,
    unit: string,
    hint?: string
  ) => (
    <label className="block">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {hint && <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>}
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={m[key] as number}
          onChange={(e) => set(key, num(e.target.value) as never)}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
        />
        <span className="text-xs text-slate-500 w-12">{unit}</span>
      </div>
    </label>
  );

  const toggle = (label: string, key: keyof ErgoManualInputs, hint?: string) => (
    <button
      type="button"
      onClick={() => set(key, !m[key] as never)}
      className={`text-left rounded-xl border p-3 transition-colors ${
        m[key]
          ? 'border-emerald-400 bg-emerald-500/10'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="font-semibold text-sm text-slate-100">{label}</div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to capture
        </button>

        <h1 className="text-2xl font-bold tracking-tight">Task details</h1>
        <p className="text-slate-400 text-sm mt-1">
          A few factors the camera can't see. Sensible defaults are pre-filled — adjust what you know.
        </p>

        {/* Load & force */}
        <section className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Load &amp; force</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {numberField('Load handled', 'loadKg', 'kg', 'Weight of the object handled / force applied.')}
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Grip / coupling quality</span>
              <select
                value={m.coupling}
                onChange={(e) => set('coupling', e.target.value as ErgoManualInputs['coupling'])}
                className="mt-1.5 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
              >
                <option value="good">Good — solid handles</option>
                <option value="fair">Fair — usable grip</option>
                <option value="poor">Poor — awkward grip</option>
                <option value="unacceptable">Unacceptable — no grip</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {toggle('Static / sustained hold', 'loadStatic', 'Held > ~1 min or repeatedly.')}
            {toggle('Sudden / jerky force', 'shockOrRapid', 'Rapid build-up of force.')}
          </div>
        </section>

        {/* Repetition & duration */}
        <section className="mt-8 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Repetition &amp; exposure</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {numberField('Repetition', 'actionsPerMinute', '/min', 'Actions per minute for this task.')}
            {numberField('Daily exposure', 'durationHoursPerDay', 'h/day', 'Hours per day in this posture/task.')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {toggle('Trunk twisting', 'trunkTwisted', 'Torso rotates during the task.')}
            {toggle('Neck twist / side-bend', 'neckTwisted', 'Head turns or tilts noticeably.')}
          </div>
        </section>

        {/* NIOSH lifting specifics */}
        {needsLift && (
          <section className="mt-8 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300">Lift geometry (NIOSH)</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {numberField('Horizontal distance', 'horizontalCm', 'cm', 'Hands to ankles at the lift origin.')}
              {numberField('Hand height at origin', 'verticalCm', 'cm', 'Height of the hands when the lift starts.')}
              {numberField('Vertical travel', 'travelCm', 'cm', 'How far the load moves up/down.')}
              {numberField('Asymmetry angle', 'asymmetryDeg', '°', 'How far the body twists to lift.')}
              {numberField('Lift frequency', 'liftsPerMinute', '/min', 'Lifts per minute.')}
            </div>
          </section>
        )}

        <button
          onClick={() => onGenerate(m)}
          className="mt-10 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-emerald-500/30"
        >
          <Sparkles className="w-4 h-4" /> Generate risk assessment <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
