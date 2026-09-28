import { useMemo, useState } from 'react';
import { ChevronLeft, ArrowRight, Ruler, Crosshair, PackageSearch } from 'lucide-react';
import { ErgoObjectInputs, ErgoCalibration, DetectedObject } from '@/lib/ergo/ergoTypes';
import { OBJECT_LABEL, MEASUREMENT_MODE_LABEL } from '@/lib/ergo/ergoKnowledge';
import { REFERENCE_PRESETS, withDerivedScale } from '@/lib/ergo/calibration';

interface Props {
  objects: DetectedObject[];
  initialInputs: ErgoObjectInputs;
  initialCalibration: ErgoCalibration;
  onBack: () => void;
  onContinue: (inputs: ErgoObjectInputs, calibration: ErgoCalibration) => void;
}

// Assumed capture width used to turn a "% of frame" reference size into pixels.
// openCamera() requests 1280×720, so this matches the typical captured frame.
const ASSUMED_FRAME_PX = 1280;

/**
 * The manual measurement layer (spec §11/§12): optional calibration via a known
 * reference object, plus optional real dimensions the camera can't reliably get.
 * Everything here is optional — "Continue" works with nothing filled in, and the
 * relationship engine simply stays in estimated mode.
 */
export default function ErgoObjectMeasure({
  objects,
  initialInputs,
  initialCalibration,
  onBack,
  onContinue,
}: Props) {
  const [inputs, setInputs] = useState<ErgoObjectInputs>(initialInputs);
  const [cal, setCal] = useState<ErgoCalibration>(initialCalibration);

  // Distinct object types found, for the "detected workplace" summary.
  const detected = useMemo(() => {
    const map = new Map<string, DetectedObject>();
    for (const o of objects) {
      const prev = map.get(o.type);
      if (!prev || o.score > prev.score) map.set(o.type, o);
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }, [objects]);

  const numOrNull = (v: string): number | null => (v === '' ? null : Number(v));

  const setInput = <K extends keyof ErgoObjectInputs>(k: K, v: ErgoObjectInputs[K]) =>
    setInputs((p) => ({ ...p, [k]: v }));

  // ---- Calibration helpers ----
  const preset = REFERENCE_PRESETS.find((p) => p.id === cal.referenceId) ?? null;
  const isCustom = cal.referenceId === 'custom';
  const [refPercent, setRefPercent] = useState<number>(() =>
    cal.refPixels != null ? Math.round((cal.refPixels / ASSUMED_FRAME_PX) * 100) : 0
  );

  const recalc = (next: Partial<ErgoCalibration>, percent = refPercent) => {
    const merged: ErgoCalibration = {
      ...cal,
      ...next,
      refPixels: percent > 0 ? (percent / 100) * ASSUMED_FRAME_PX : null,
    };
    setCal(withDerivedScale(merged));
  };

  const measurementBadge = (value: number | null, calibrated: boolean) => {
    const mode = value != null ? 'user-measured' : calibrated ? 'calibrated' : 'estimated';
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10">
        {MEASUREMENT_MODE_LABEL[mode]}
      </span>
    );
  };

  const numberField = (
    label: string,
    key: keyof ErgoObjectInputs,
    unit: string,
    hint: string
  ) => (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        {measurementBadge(inputs[key] as number | null, !!cal.pixelsPerCm)}
      </div>
      <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={0}
          placeholder="—"
          value={(inputs[key] as number | null) ?? ''}
          onChange={(e) => setInput(key, numOrNull(e.target.value) as never)}
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
        />
        <span className="text-xs text-slate-500 w-12">{unit}</span>
      </div>
    </label>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to scan
        </button>

        <h1 className="text-2xl font-bold tracking-tight">Measurements &amp; calibration</h1>
        <p className="text-slate-400 text-sm mt-1">
          Optional — improves accuracy. A single camera can’t measure true sizes reliably, so anything you enter
          here is used as a <span className="text-slate-200">user-measured</span> value instead of an estimate.
        </p>

        {/* Detected workplace summary */}
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
            <PackageSearch className="w-4 h-4 text-sky-400" /> Detected workplace
          </h2>
          {detected.length === 0 ? (
            <p className="text-sm text-slate-500 rounded-xl border border-white/10 bg-white/5 p-3">
              No objects were confidently detected in the workstation frame. You can still enter measurements
              below to get relationship findings.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detected.map((o) => (
                <span
                  key={o.type}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-200 flex items-center gap-1.5"
                >
                  {OBJECT_LABEL[o.type] ?? o.label}
                  <span className="text-slate-500">{Math.round(o.score * 100)}%</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Manual object measurements */}
        <section className="mt-8 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Ruler className="w-4 h-4 text-emerald-400" /> Object measurements
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {numberField('Desk / work-surface height', 'deskHeightCm', 'cm', 'Floor to the top of the work surface.')}
            {numberField('Chair seat height', 'chairSeatHeightCm', 'cm', 'Floor to the top of the seat pad.')}
            {numberField('Eye-to-screen distance', 'monitorDistanceCm', 'cm', 'Eyes to the front of the screen.')}
          </div>
          <div>
            <span className="text-sm font-medium text-slate-300">Footrest in use?</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                { v: null, label: 'Unknown' },
                { v: true, label: 'Yes' },
                { v: false, label: 'No' },
              ] as { v: boolean | null; label: string }[]).map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setInput('footrestPresent', opt.v)}
                  className={`rounded-xl border p-2.5 text-sm font-medium transition-colors ${
                    inputs.footrestPresent === opt.v
                      ? 'border-emerald-400 bg-emerald-500/10 text-slate-100'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Calibration */}
        <section className="mt-8 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Crosshair className="w-4 h-4 text-emerald-400" /> Reference-object calibration
          </h2>
          <p className="text-xs text-slate-500">
            Put a known-size object in the shot (e.g. a sheet of A4) and tell us how wide it appears. This turns
            on-screen distances into a <span className="text-slate-300">calibrated estimate</span>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Reference object</span>
              <select
                value={cal.referenceId ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null;
                  const p = REFERENCE_PRESETS.find((r) => r.id === id);
                  recalc({ referenceId: id, realCm: p && p.widthCm > 0 ? p.widthCm : cal.realCm });
                }}
                className="mt-1.5 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
              >
                <option value="">None (stay in estimated mode)</option>
                {REFERENCE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            {isCustom && (
              <label className="block">
                <span className="text-sm font-medium text-slate-300">Reference real width</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={cal.realCm ?? ''}
                    onChange={(e) => recalc({ realCm: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
                  />
                  <span className="text-xs text-slate-500 w-12">cm</span>
                </div>
              </label>
            )}
          </div>
          {cal.referenceId && (
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">How wide does it appear across the frame?</span>
                <span className="text-xs text-slate-400">{refPercent}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={refPercent}
                onChange={(e) => {
                  const pct = Number(e.target.value);
                  setRefPercent(pct);
                  recalc({}, pct);
                }}
                className="mt-2 w-full accent-emerald-500"
              />
              <p className="text-xs mt-1.5">
                {cal.pixelsPerCm ? (
                  <span className="text-emerald-400">
                    Calibrated: ~{cal.pixelsPerCm.toFixed(1)} px/cm — distances will be shown as calibrated estimates.
                  </span>
                ) : (
                  <span className="text-slate-500">Set both the reference and its on-screen width to calibrate.</span>
                )}
              </p>
            </label>
          )}
        </section>

        <button
          onClick={() => onContinue(inputs, cal)}
          className="mt-10 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-emerald-500/30"
        >
          Continue to task details <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
