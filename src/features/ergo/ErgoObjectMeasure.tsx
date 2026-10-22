import { useMemo, useState } from 'react';
import { ChevronLeft, ArrowRight, Ruler, PackageSearch, User, Scale, Info, Trash2 } from 'lucide-react';
import {
  ErgoObjectInputs, ErgoCalibration, ErgoPersonInputs, MeasuredItem, ObjectDimKey, MeasurementMode,
} from '@/lib/ergo/ergoTypes';
import { OBJECT_LABEL, MEASUREMENT_MODE_LABEL } from '@/lib/ergo/ergoKnowledge';
import { POPULATIONS, PopulationId, isPlausibleStature, STATURE_MIN_CM, STATURE_MAX_CM } from '@/lib/ergo/anthropometry';
import { buildFitReport, hasFitData } from '@/lib/ergo/furnitureFit';
import ErgoPhotoMeasure, { MeasurePhoto, SavedMeasure } from './ErgoPhotoMeasure';
import ErgoFitCompare from './ErgoFitCompare';
import { ErgoCaptures, ErgoWorkstationCapture } from './ergoTypes';

interface Props {
  workstation: ErgoWorkstationCapture | null;
  captures: ErgoCaptures;
  initialInputs: ErgoObjectInputs;
  initialPerson: ErgoPersonInputs;
  initialItems: MeasuredItem[];
  initialCalibration: ErgoCalibration;
  onBack: () => void;
  onContinue: (
    inputs: ErgoObjectInputs,
    person: ErgoPersonInputs,
    items: MeasuredItem[],
    calibration: ErgoCalibration
  ) => void;
}

const DIM_FIELDS: { key: ObjectDimKey; label: string; hint: string }[] = [
  { key: 'chairSeatHeightCm', label: 'Seat height', hint: 'Floor → top of the seat' },
  { key: 'seatDepthCm', label: 'Seat depth', hint: 'Front edge → backrest' },
  { key: 'seatWidthCm', label: 'Seat width', hint: 'Left → right edge' },
  { key: 'deskHeightCm', label: 'Desk height', hint: 'Floor → desk top' },
  { key: 'monitorTopHeightCm', label: 'Screen top height', hint: 'Floor → top edge of screen' },
  { key: 'monitorDistanceCm', label: 'Eye → screen distance', hint: 'Eyes → screen surface' },
];

/**
 * Measure & compare (spec §11/§12): measure the person and the furniture — by
 * tapping on a calibrated photo or typing tape-measure values — and see live
 * whether the workstation suits this person and the average human.
 * Everything is optional; "Continue" works with nothing filled in.
 */
export default function ErgoObjectMeasure({
  workstation,
  captures,
  initialInputs,
  initialPerson,
  initialItems,
  initialCalibration,
  onBack,
  onContinue,
}: Props) {
  const [inputs, setInputs] = useState<ErgoObjectInputs>(initialInputs);
  const [person, setPerson] = useState<ErgoPersonInputs>(initialPerson);
  const [items, setItems] = useState<MeasuredItem[]>(initialItems);
  const [cal, setCal] = useState<ErgoCalibration>(initialCalibration);
  const [uploads, setUploads] = useState<string[]>([]);
  const [warn, setWarn] = useState('');

  const photos = useMemo<MeasurePhoto[]>(() => {
    const out: MeasurePhoto[] = [];
    if (workstation)
      out.push({
        id: 'workstation',
        label: 'Workstation',
        src: workstation.rawImageData ?? workstation.imageData,
        landmarks: workstation.landmarks,
        objects: workstation.objects,
      });
    if (captures.front)
      out.push({ id: 'front', label: 'Body — front', src: captures.front.rawImageData ?? captures.front.imageData, landmarks: captures.front.landmarks });
    if (captures.side)
      out.push({ id: 'side', label: 'Body — side', src: captures.side.rawImageData ?? captures.side.imageData, landmarks: captures.side.landmarks });
    uploads.forEach((src, i) => out.push({ id: `upload-${i}`, label: `Photo ${i + 1}`, src }));
    return out;
  }, [workstation, captures, uploads]);

  const detected = useMemo(() => {
    const map = new Map<string, { type: string; score: number; label: string }>();
    for (const o of workstation?.objects ?? []) {
      const prev = map.get(o.type);
      if (!prev || o.score > prev.score) map.set(o.type, o);
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }, [workstation]);

  const setDim = (key: ObjectDimKey, value: number | null, mode: MeasurementMode) =>
    setInputs((p) => ({ ...p, [key]: value, sources: { ...p.sources, [key]: mode } }));

  const onSave = (m: SavedMeasure) => {
    setWarn('');
    if (m.target === 'personHeight') {
      if (!isPlausibleStature(m.cm)) {
        setWarn(
          `${m.cm} cm is not a plausible adult height (${STATURE_MIN_CM}–${STATURE_MAX_CM} cm). Check that the reference is at the person’s distance from the camera and the points are on head-top and floor.`
        );
        return;
      }
      setPerson((p) => ({ ...p, statureCm: m.cm, statureMode: 'calibrated' }));
      return;
    }
    if (m.target === 'shoulderWidth') {
      setPerson((p) => ({ ...p, shoulderWidthCm: m.cm, shoulderMode: 'calibrated' }));
      return;
    }
    if (m.target === 'customHeight' || m.target === 'customWidth') {
      const name = m.name ?? 'Object';
      setItems((prev) => {
        const id = name.toLowerCase();
        const existing = prev.find((i) => i.id === id);
        const base: MeasuredItem = existing ?? { id, label: name, heightCm: null, widthCm: null, errCm: null, mode: 'calibrated' };
        const next: MeasuredItem = {
          ...base,
          [m.target === 'customHeight' ? 'heightCm' : 'widthCm']: m.cm,
          errCm: Math.max(base.errCm ?? 0, m.errCm),
        };
        return existing ? prev.map((i) => (i.id === id ? next : i)) : [...prev, next];
      });
      return;
    }
    setDim(m.target, m.cm, 'calibrated');
  };

  const report = useMemo(() => buildFitReport(person, inputs, items), [person, inputs, items]);
  const showReport = hasFitData(inputs, person, items);

  const numOrNull = (v: string): number | null => (v === '' || Number(v) <= 0 ? null : Number(v));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 mb-6">
          <ChevronLeft className="w-4 h-4" /> Back to scan
        </button>

        <h1 className="text-2xl font-bold tracking-tight">Measure &amp; compare</h1>
        <p className="text-slate-400 text-sm mt-1">
          Measure the person and the furniture, then see if the chair, desk and screen suit this person and the
          average human (RULA / REBA). Everything is optional.
        </p>

        {/* ---- Person ---- */}
        <section className="mt-8 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <User className="w-4 h-4 text-emerald-400" /> Person
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-300">Height</span>
                {person.statureCm != null && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10">
                    {MEASUREMENT_MODE_LABEL[person.statureMode]}
                  </span>
                )}
              </div>
              <span className="block text-xs text-slate-500 mt-0.5">Type it, or measure it on a photo below.</span>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min={STATURE_MIN_CM}
                  max={STATURE_MAX_CM}
                  placeholder="e.g. 168"
                  value={person.statureCm ?? ''}
                  onChange={(e) => setPerson((p) => ({ ...p, statureCm: numOrNull(e.target.value), statureMode: 'user-measured' }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
                />
                <span className="text-xs text-slate-500 w-10">cm</span>
              </div>
              {person.statureCm != null && !isPlausibleStature(person.statureCm) && (
                <span className="text-xs text-amber-400">Enter a height between {STATURE_MIN_CM} and {STATURE_MAX_CM} cm.</span>
              )}
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Compare with average human</span>
              <span className="block text-xs text-slate-500 mt-0.5">50th-percentile adult of this population.</span>
              <select
                value={person.population}
                onChange={(e) => setPerson((p) => ({ ...p, population: e.target.value as PopulationId }))}
                className="mt-1.5 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
              >
                {POPULATIONS.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900">{p.label}</option>
                ))}
              </select>
            </label>
          </div>
          {person.shoulderWidthCm != null && (
            <p className="text-xs text-slate-400">
              Shoulder width: <b className="text-slate-200">{person.shoulderWidthCm} cm</b> ({MEASUREMENT_MODE_LABEL[person.shoulderMode]})
            </p>
          )}
        </section>

        {/* ---- Photo measuring ---- */}
        <section className="mt-8 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Scale className="w-4 h-4 text-amber-400" /> Measure on a photo
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-400 space-y-1">
            <p className="flex items-center gap-1.5 text-slate-300 font-medium"><Info className="w-3.5 h-3.5" /> For accurate centimetres</p>
            <p>• Keep the camera level and straight-on, 2–3 m away (not tilted up/down).</p>
            <p>• The reference (A4 sheet, ID card or the standing person) must be at the <b>same distance</b> from the camera as the object — e.g. A4 taped to the chair/desk side.</p>
            <p>• For heights, put the bottom point on the floor directly below the object’s edge. Zoom in and drag points onto exact edges.</p>
          </div>
          {warn && <p className="text-xs text-amber-400">{warn}</p>}
          <ErgoPhotoMeasure
            photos={photos}
            personHeightCm={isPlausibleStature(person.statureCm) ? person.statureCm : null}
            onSave={onSave}
            onWorkstationCalibration={setCal}
            onUploadPhoto={(src) => setUploads((u) => [...u, src])}
          />
        </section>

        {/* ---- Values ---- */}
        <section className="mt-8 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Ruler className="w-4 h-4 text-emerald-400" /> Furniture sizes
            <span className="text-xs font-normal text-slate-500">· filled from the photo, or type tape values</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {DIM_FIELDS.map((f) => {
              const v = inputs[f.key] ?? null;
              return (
                <label key={f.key} className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">{f.label}</span>
                    {v != null && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300 border border-white/10">
                        {MEASUREMENT_MODE_LABEL[inputs.sources?.[f.key] ?? 'user-measured']}
                      </span>
                    )}
                  </div>
                  <span className="block text-xs text-slate-500 mt-0.5">{f.hint}</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      placeholder="—"
                      value={v ?? ''}
                      onChange={(e) => setDim(f.key, numOrNull(e.target.value), 'user-measured')}
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-slate-100 focus:border-emerald-400 outline-none"
                    />
                    <span className="text-xs text-slate-500 w-10">cm</span>
                  </div>
                </label>
              );
            })}
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
                  onClick={() => setInputs((p) => ({ ...p, footrestPresent: opt.v }))}
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
          {items.length > 0 && (
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-300">Other objects</span>
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between text-xs text-slate-300 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <span>
                    {it.label}: {it.heightCm != null ? `H ${it.heightCm} cm` : 'H —'} · {it.widthCm != null ? `W ${it.widthCm} cm` : 'W —'}
                  </span>
                  <button onClick={() => setItems((p) => p.filter((i) => i.id !== it.id))} className="text-slate-500 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---- Live comparison ---- */}
        {showReport && (
          <section className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Does it fit? (live)</h2>
            <ErgoFitCompare report={report} />
          </section>
        )}

        {/* Detected workplace summary */}
        {detected.length > 0 && (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-3">
              <PackageSearch className="w-4 h-4 text-sky-400" /> Detected workplace
            </h2>
            <div className="flex flex-wrap gap-2">
              {detected.map((o) => (
                <span
                  key={o.type}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-200 flex items-center gap-1.5"
                >
                  {OBJECT_LABEL[o.type as keyof typeof OBJECT_LABEL] ?? o.label}
                  <span className="text-slate-500">{Math.round(o.score * 100)}%</span>
                </span>
              ))}
            </div>
          </section>
        )}

        <button
          onClick={() => onContinue(inputs, person, items, cal)}
          className="mt-10 w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-emerald-500/30"
        >
          Continue to task details <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
