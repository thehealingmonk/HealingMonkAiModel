import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, Check, CheckCircle2, Star, Stethoscope, Plus, X } from 'lucide-react';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';
import {
  IDEAL_POSTURE_CONDITIONS,
  ConditionPreset,
  getMyPositionPreset,
  saveMyPositionPreset,
} from '@/services/api';
import PoseIllustration from '@/components/common/PoseIllustration';

interface Props {
  onBack: () => void;
}

// The full-body poses are the always-on baseline (the built-in defaults live here).
const FULL_BODY_POSES = CLINICAL_ASSESSMENTS.filter((a) => a.bodyRegion === 'Full Body');
const FULL_BODY_IDS = new Set(FULL_BODY_POSES.map((a) => a.id));
const BUILTIN_DEFAULTS = CLINICAL_ASSESSMENTS.filter((a) => a.defaultSelected).map((a) => a.id);

// Doctor's own "default positions" setup. Two parts:
//  1. General defaults — poses always pre-ticked when this doctor starts an
//     assessment (their extension of the built-in defaults).
//  2. Per-condition — extra poses to pre-tick when the patient has that pain area
//     (e.g. a patient assigned for "Shoulder" auto-loads the doctor's shoulder
//     poses on Start Assessment).
export default function DoctorPositions({ onBack }: Props) {
  const [defaultPoses, setDefaultPoses] = useState<string[]>(BUILTIN_DEFAULTS);
  const [byCondition, setByCondition] = useState<Record<string, string[]>>({});
  const [condition, setCondition] = useState<string>(IDEAL_POSTURE_CONDITIONS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { preset } = await getMyPositionPreset();
        if (preset) {
          // Always-on set is full-body only; drop any legacy non-full-body ids so
          // they no longer apply to every patient (they belong under a pain area).
          if (preset.defaultPoses.length) setDefaultPoses(preset.defaultPoses.filter((id) => FULL_BODY_IDS.has(id)));
          const map: Record<string, string[]> = {};
          for (const c of preset.byCondition) map[c.condition] = c.poses;
          setByCondition(map);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your positions');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleDefault = (id: string) =>
    setDefaultPoses((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const conditionPoses = byCondition[condition] ?? [];
  const toggleCondition = (id: string) =>
    setByCondition((prev) => {
      const cur = prev[condition] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...prev, [condition]: next };
    });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const byConditionArr: ConditionPreset[] = Object.entries(byCondition)
        .map(([c, poses]) => ({ condition: c, poses }))
        .filter((c) => c.poses.length > 0);
      await saveMyPositionPreset({ defaultPoses, byCondition: byConditionArr });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const conditionCount = useMemo(
    () => Object.fromEntries(Object.entries(byCondition).map(([c, p]) => [c, p.length])),
    [byCondition]
  );

  return (
    <div className="hm-page-enter max-w-4xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to patients
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">My Default Positions</h2>
          <p className="text-slate-400 text-sm">
            Choose the poses that auto-select when you start an assessment — overall, and per pain area. These are yours
            only.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="hm-lift inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-lg shadow-emerald-500/30 disabled:opacity-50"
        >
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-400">Loading…</div>
      ) : (
        <>
          {/* General defaults */}
          <section className="glass-dark rounded-2xl p-5 mb-6" data-reveal>
            <div className="mb-1 flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold text-white">
                Always pre-selected · full body{' '}
                <span className="text-slate-400 font-normal text-sm">· {defaultPoses.length} selected</span>
              </h3>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              These full-body poses are ticked for <b>every</b> assessment, whatever the pain area. Pain-area specific
              poses go in the section below — they only load when the patient has that pain area.
            </p>
            <PoseGrid items={FULL_BODY_POSES} selected={defaultPoses} onToggle={toggleDefault} />
          </section>

          {/* Per-condition */}
          <section className="glass-dark rounded-2xl p-5" data-reveal>
            <div className="mb-1 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-white">By pain area</h3>
            </div>
            <p className="text-slate-400 text-sm mb-4">
              Extra poses to pre-select when the patient has this pain area. E.g. set your Shoulder poses here — a patient
              assigned for Shoulder loads them automatically on Start Assessment.
            </p>

            <div className="flex flex-wrap gap-2 mb-5">
              {IDEAL_POSTURE_CONDITIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    condition === c
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30'
                      : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {c}
                  {conditionCount[c] > 0 && (
                    <span className={`ml-1.5 text-[11px] ${condition === c ? 'text-white/80' : 'text-emerald-400'}`}>
                      {conditionCount[c]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <PoseGrid selected={conditionPoses} onToggle={toggleCondition} />
          </section>
        </>
      )}
    </div>
  );
}

// A grid of capture poses with an explicit "Add to default" / "Remove from
// default" button per card, so it's clear what's in the default set. `items`
// limits which poses are shown (e.g. full-body only for the always section).
function PoseGrid({
  selected,
  onToggle,
  items = CLINICAL_ASSESSMENTS,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  items?: typeof CLINICAL_ASSESSMENTS;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {items.map((a) => {
        const active = selected.includes(a.id);
        return (
          <div
            key={a.id}
            className={`relative overflow-hidden rounded-xl border transition-all ${
              active ? 'border-emerald-400/70 ring-1 ring-emerald-400/40 bg-emerald-500/10' : 'border-white/10 bg-white/5'
            }`}
          >
            {active && (
              <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-emerald-500 p-0.5 text-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </span>
            )}
            <PoseIllustration pose={a.id} className="h-24 w-full bg-slate-950/40" />
            <div className="border-t border-white/10 p-2">
              <p className="text-xs font-medium leading-tight text-white">{a.name}</p>
              <p className="mt-0.5 text-[10px] text-slate-400 capitalize">{a.bodyRegion}</p>
              <button
                type="button"
                onClick={() => onToggle(a.id)}
                className={`mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? 'border border-rose-400/40 text-rose-300 hover:bg-rose-500/10'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30 hover:opacity-90'
                }`}
              >
                {active ? (
                  <>
                    <X className="w-3.5 h-3.5" /> Remove from default
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> Add to default
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
