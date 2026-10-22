import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Ruler, Upload, ZoomIn, ZoomOut, Wand2, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import type { Landmark } from '@/lib/poseDetection';
import { DetectedObject, ErgoCalibration, ObjectDimKey } from '@/lib/ergo/ergoTypes';
import { OBJECT_LABEL } from '@/lib/ergo/ergoKnowledge';
import { REFERENCE_PRESETS } from '@/lib/ergo/calibration';
import {
  ImgPoint, pxDist, scaleFromReference, measureCm, boxDimsCm, boxHeightPoints, boxWidthPoints, lineTiltDeg,
} from '@/lib/ergo/photoMeasure';
import {
  standingPersonPoints, shoulderPoints, SHOULDER_JOINT_TO_BIACROMIAL, isPlausibleStature,
} from '@/lib/ergo/anthropometry';

/** A photo the user can measure on. */
export interface MeasurePhoto {
  id: string;
  label: string;
  src: string;
  landmarks?: Landmark[] | null;
  objects?: DetectedObject[];
}

export type MeasureTarget = ObjectDimKey | 'personHeight' | 'shoulderWidth' | 'customHeight' | 'customWidth';

export interface SavedMeasure {
  target: MeasureTarget;
  cm: number;
  errCm: number;
  /** Name for custom objects. */
  name?: string;
}

const TARGETS: { key: MeasureTarget; label: string; hint: string; axis: 'vertical' | 'horizontal' }[] = [
  { key: 'personHeight', label: 'Person height', hint: 'Top of head → floor (standing straight)', axis: 'vertical' },
  { key: 'shoulderWidth', label: 'Shoulder width', hint: 'Outer edge to outer edge of the shoulders (front view)', axis: 'horizontal' },
  { key: 'chairSeatHeightCm', label: 'Seat height', hint: 'Floor → top of the seat cushion (front edge)', axis: 'vertical' },
  { key: 'seatDepthCm', label: 'Seat depth', hint: 'Front edge of seat → backrest (side view)', axis: 'horizontal' },
  { key: 'seatWidthCm', label: 'Seat width', hint: 'Left → right edge of the seat (front view)', axis: 'horizontal' },
  { key: 'deskHeightCm', label: 'Desk height', hint: 'Floor → top of the desk surface', axis: 'vertical' },
  { key: 'monitorTopHeightCm', label: 'Screen top height', hint: 'Floor → top edge of the screen', axis: 'vertical' },
  { key: 'monitorDistanceCm', label: 'Eye → screen distance', hint: 'Eye → screen surface (side view)', axis: 'horizontal' },
  { key: 'customHeight', label: 'Any object — height', hint: 'Bottom → top of any object', axis: 'vertical' },
  { key: 'customWidth', label: 'Any object — width', hint: 'Left → right of any object', axis: 'horizontal' },
];

interface Scale {
  a: ImgPoint;
  b: ImgPoint;
  realCm: number;
  refId: string;
  pxPerCm: number;
}

interface Props {
  photos: MeasurePhoto[];
  /** Person stature (cm) — enables "use the person as the scale". */
  personHeightCm: number | null;
  onSave: (m: SavedMeasure) => void;
  /** Calibration of the workstation photo (for the relationship engine). */
  onWorkstationCalibration?: (cal: ErgoCalibration) => void;
  onUploadPhoto: (src: string) => void;
}

/** Screen pixels a fingertip/cursor may miss by. */
const TAP_ERROR_SCREEN_PX = 4;

export default function ErgoPhotoMeasure({ photos, personHeightCm, onSave, onWorkstationCalibration, onUploadPhoto }: Props) {
  const [photoId, setPhotoId] = useState(photos[0]?.id ?? '');
  const photo = photos.find((p) => p.id === photoId) ?? photos[0] ?? null;
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'scale' | 'measure'>('scale');
  const [scales, setScales] = useState<Record<string, Scale>>({});
  const [refId, setRefId] = useState('a4-landscape');
  const [customRef, setCustomRef] = useState<number | ''>('');
  const [target, setTarget] = useState<MeasureTarget>('chairSeatHeightCm');
  const [customName, setCustomName] = useState('');
  const [pts, setPts] = useState<ImgPoint[]>([]);
  const [shownW, setShownW] = useState(1);
  const [savedFlash, setSavedFlash] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scale = photo ? scales[photo.id] ?? null : null;
  const targetDef = TARGETS.find((t) => t.key === target)!;

  // New photo → fresh points; keep that photo's scale.
  useEffect(() => {
    setNat(null);
    setPts([]);
    setMode(photo && scales[photo.id] ? 'measure' : 'scale');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoId]);

  useEffect(() => {
    if (!photos.find((p) => p.id === photoId) && photos[0]) setPhotoId(photos[0].id);
  }, [photos, photoId]);

  // Track displayed width so the tap error converts to photo pixels.
  useEffect(() => {
    const update = () => {
      const r = svgRef.current?.getBoundingClientRect();
      if (r && r.width) setShownW(r.width);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [nat, zoom]);

  const tapErrPx = nat ? TAP_ERROR_SCREEN_PX * (nat.w / Math.max(1, shownW)) : 4;

  const refRealCm = (): number | null => {
    if (refId === 'person') return isPlausibleStature(personHeightCm) ? personHeightCm : null;
    if (refId === 'custom') return typeof customRef === 'number' && customRef > 0 ? customRef : null;
    return REFERENCE_PRESETS.find((p) => p.id === refId)?.widthCm ?? null;
  };

  // ---- pointer handling (photo pixel space) ----
  const toImg = (e: React.PointerEvent): ImgPoint | null => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !nat) return null;
    return {
      x: Math.max(0, Math.min(nat.w, ((e.clientX - r.left) / r.width) * nat.w)),
      y: Math.max(0, Math.min(nat.h, ((e.clientY - r.top) / r.height) * nat.h)),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    const p = toImg(e);
    if (!p) return;
    const idx = (e.target as Element).getAttribute?.('data-idx');
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (idx != null) {
      drag.current = Number(idx);
      return;
    }
    setPts((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
    drag.current = pts.length >= 2 ? 0 : pts.length;
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current == null) return;
    const p = toImg(e);
    if (!p) return;
    const i = drag.current;
    setPts((prev) => prev.map((q, j) => (j === i ? p : q)));
  };
  const onUp = () => {
    drag.current = null;
  };

  // ---- derived values ----
  const current = useMemo(() => {
    if (pts.length < 2) return null;
    if (mode === 'scale') return { px: pxDist(pts[0], pts[1]) };
    if (!scale) return null;
    const m = measureCm(pts[0], pts[1], scale.pxPerCm, pxDist(scale.a, scale.b), tapErrPx);
    return m ? { px: pxDist(pts[0], pts[1]), ...m } : null;
  }, [pts, mode, scale, tapErrPx]);

  // A reference card/sheet may lie at any angle; heights and widths should be straight.
  const tilt =
    pts.length !== 2 || (mode === 'scale' && refId !== 'person')
      ? 0
      : lineTiltDeg(pts[0], pts[1], mode === 'scale' ? 'vertical' : targetDef.axis);

  const confirmScale = () => {
    if (!photo || pts.length < 2) return;
    const real = refRealCm();
    if (!real) return;
    const pxPerCm = scaleFromReference(pts[0], pts[1], real);
    if (!pxPerCm) return;
    const s: Scale = { a: pts[0], b: pts[1], realCm: real, refId, pxPerCm };
    setScales((prev) => ({ ...prev, [photo.id]: s }));
    if (photo.id === 'workstation')
      onWorkstationCalibration?.({ referenceId: refId, realCm: real, refPixels: pxDist(s.a, s.b), pixelsPerCm: pxPerCm });
    setPts([]);
    setMode('measure');
  };

  const save = () => {
    if (!current || !('cm' in current) || current.cm == null) return;
    const isCustom = target === 'customHeight' || target === 'customWidth';
    if (isCustom && !customName.trim()) return;
    onSave({ target, cm: current.cm, errCm: current.errCm, name: isCustom ? customName.trim() : undefined });
    setSavedFlash(`${isCustom ? customName.trim() + ' ' : ''}${targetDef.label.replace('Any object — ', '')}: ${current.cm} cm saved`);
    setTimeout(() => setSavedFlash(''), 2200);
    setPts([]);
  };

  // ---- auto-assist from pose / detection ----
  const autoPerson = photo && nat ? standingPersonPoints(photo.landmarks, nat.w, nat.h) : null;
  const autoShoulder = (() => {
    if (!photo || !nat) return null;
    const s = shoulderPoints(photo.landmarks, nat.w, nat.h);
    if (!s) return null;
    // Push the joint centres out to the bony shoulder edges.
    const cx = (s.a.x + s.b.x) / 2;
    const cy = (s.a.y + s.b.y) / 2;
    const k = SHOULDER_JOINT_TO_BIACROMIAL;
    return [
      { x: cx + (s.a.x - cx) * k, y: cy + (s.a.y - cy) * k },
      { x: cx + (s.b.x - cx) * k, y: cy + (s.b.y - cy) * k },
    ];
  })();

  const objects = (photo?.objects ?? []).filter((o) => o.type !== 'person' && o.score >= 0.35);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onUploadPhoto(reader.result);
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  useEffect(() => {
    // A newly uploaded photo is appended — jump to it.
    const last = photos[photos.length - 1];
    if (last?.id.startsWith('upload-')) setPhotoId(last.id);
  }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sw = nat ? Math.max(2, nat.w / 320) : 3;
  const fs = nat ? Math.max(14, nat.w / 45) : 16;

  const line = (a: ImgPoint, b: ImgPoint, color: string, label: string | null, handles: boolean) => (
    <g>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth={sw * 2.2} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {[a, b].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={sw * 5} fill={handles ? `${color}33` : 'none'} stroke={color} strokeWidth={sw * 0.8} data-idx={handles ? i : undefined} style={{ cursor: handles ? 'grab' : 'default' }} />
          <line x1={p.x - sw * 2.5} y1={p.y} x2={p.x + sw * 2.5} y2={p.y} stroke={color} strokeWidth={sw * 0.6} pointerEvents="none" />
          <line x1={p.x} y1={p.y - sw * 2.5} x2={p.x} y2={p.y + sw * 2.5} stroke={color} strokeWidth={sw * 0.6} pointerEvents="none" />
        </g>
      ))}
      {label && (
        <text x={(a.x + b.x) / 2 + sw * 4} y={(a.y + b.y) / 2} fontSize={fs} fontWeight={700} fill={color} stroke="#0f172a" strokeWidth={fs / 6} paintOrder="stroke" pointerEvents="none">
          {label}
        </text>
      )}
    </g>
  );

  if (!photo) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
        No photo yet. Upload or take a photo to measure on.
        <button onClick={() => fileRef.current?.click()} className="mt-3 flex items-center gap-2 text-emerald-300">
          <Upload className="w-4 h-4" /> Upload / take photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      </div>
    );
  }

  const realForRef = refRealCm();

  return (
    <div className="space-y-3">
      {/* Photo picker */}
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            onClick={() => setPhotoId(p.id)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border ${
              p.id === photo.id ? 'border-emerald-400 bg-emerald-500/10 text-slate-100' : 'border-white/10 bg-white/5 text-slate-300'
            }`}
          >
            {p.label}
            {scales[p.id] && <Check className="inline w-3 h-3 ml-1 text-emerald-400" />}
          </button>
        ))}
        <button
          onClick={() => fileRef.current?.click()}
          className="text-xs font-medium px-3 py-1.5 rounded-full border border-dashed border-white/20 text-slate-300 flex items-center gap-1"
        >
          <Upload className="w-3 h-3" /> Upload / take photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      </div>

      {/* Step switch */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setMode('scale'); setPts([]); }}
          className={`rounded-xl border p-2.5 text-sm font-medium flex items-center justify-center gap-2 ${
            mode === 'scale' ? 'border-amber-400 bg-amber-500/10 text-slate-100' : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          <Crosshair className="w-4 h-4" /> 1 · Set scale {scale && <Check className="w-3.5 h-3.5 text-emerald-400" />}
        </button>
        <button
          onClick={() => { if (scale) { setMode('measure'); setPts([]); } }}
          disabled={!scale}
          className={`rounded-xl border p-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 ${
            mode === 'measure' ? 'border-emerald-400 bg-emerald-500/10 text-slate-100' : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          <Ruler className="w-4 h-4" /> 2 · Measure
        </button>
      </div>

      {/* Controls for the current step */}
      {mode === 'scale' ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs text-slate-300">
            Pick something of known size that is <b>in the same spot (same distance from the camera)</b> as what you
            want to measure, then tap its two ends on the photo.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={refId}
              onChange={(e) => {
                setRefId(e.target.value);
                if (e.target.value === 'person' && autoPerson) setPts([autoPerson.top, autoPerson.floor]);
              }}
              className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5 text-sm text-slate-100"
            >
              {REFERENCE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
              <option value="person" disabled={!isPlausibleStature(personHeightCm)}>
                Standing person ({isPlausibleStature(personHeightCm) ? `${personHeightCm} cm` : 'enter height first'})
              </option>
            </select>
            {refId === 'custom' && (
              <input
                type="number"
                min={1}
                placeholder="length cm"
                value={customRef}
                onChange={(e) => setCustomRef(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-28 rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5 text-sm text-slate-100"
              />
            )}
            {refId === 'person' && autoPerson && (
              <button onClick={() => setPts([autoPerson.top, autoPerson.floor])} className="text-xs text-sky-300 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" /> Auto-place head & feet
              </button>
            )}
          </div>
          {refId === 'person' && autoPerson && !autoPerson.standing && (
            <p className="text-xs text-amber-400">The person doesn’t look upright — this scale works only for someone standing straight.</p>
          )}
          <button
            onClick={confirmScale}
            disabled={pts.length < 2 || !realForRef}
            className="w-full rounded-lg bg-amber-500 disabled:bg-slate-700 text-slate-950 disabled:text-slate-400 font-semibold py-2 text-sm"
          >
            {pts.length < 2 ? `Tap ${2 - pts.length} more point${pts.length === 1 ? '' : 's'} on the reference` : `Use this as ${realForRef ?? '?'} cm`}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/5 p-3 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={target}
              onChange={(e) => {
                const t = e.target.value as MeasureTarget;
                setTarget(t);
                if (t === 'personHeight' && autoPerson) setPts([autoPerson.top, autoPerson.floor]);
                else if (t === 'shoulderWidth' && autoShoulder) setPts(autoShoulder);
                else setPts([]);
              }}
              className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5 text-sm text-slate-100"
            >
              {TARGETS.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
            {(target === 'customHeight' || target === 'customWidth') && (
              <input
                placeholder="Object name (e.g. Table)"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="flex-1 min-w-[8rem] rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5 text-sm text-slate-100"
              />
            )}
            {target === 'personHeight' && autoPerson && (
              <button onClick={() => setPts([autoPerson.top, autoPerson.floor])} className="text-xs text-sky-300 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" /> Auto-place from body scan
              </button>
            )}
            {target === 'shoulderWidth' && autoShoulder && (
              <button onClick={() => setPts(autoShoulder)} className="text-xs text-sky-300 flex items-center gap-1">
                <Wand2 className="w-3.5 h-3.5" /> Auto-place from body scan
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">{targetDef.hint}</p>
          {objects.length > 0 && nat && (
            <div className="flex flex-wrap gap-1.5">
              {objects.map((o, i) => (
                <button
                  key={i}
                  onClick={() => setPts(targetDef.axis === 'vertical' ? boxHeightPoints(o.box, nat.w, nat.h) : boxWidthPoints(o.box, nat.w, nat.h))}
                  className="text-[11px] px-2 py-1 rounded-full bg-sky-500/10 border border-sky-400/30 text-sky-200"
                >
                  Start from {OBJECT_LABEL[o.type] ?? o.label} box
                </button>
              ))}
            </div>
          )}
          <button
            onClick={save}
            disabled={!current || !('cm' in current) || ((target === 'customHeight' || target === 'customWidth') && !customName.trim())}
            className="w-full rounded-lg bg-emerald-500 disabled:bg-slate-700 text-slate-950 disabled:text-slate-400 font-semibold py-2 text-sm"
          >
            {current && 'cm' in current
              ? `Save ${targetDef.label.replace('Any object — ', '')} = ${current.cm} cm (± ${current.errCm})`
              : `Tap ${2 - pts.length} point${pts.length === 1 ? '' : 's'} on the photo`}
          </button>
          {savedFlash && <p className="text-xs text-emerald-400 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {savedFlash}</p>}
        </div>
      )}

      {tilt > 8 && (
        <p className="text-xs text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Line is {tilt}° off straight — hold the camera level, or re-place the points.
        </p>
      )}

      {/* Zoom */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <button onClick={() => setZoom((z) => Math.max(1, z - 1))} className="p-1.5 rounded-lg bg-white/5 border border-white/10"><ZoomOut className="w-4 h-4" /></button>
        <span>{zoom}×</span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 1))} className="p-1.5 rounded-lg bg-white/5 border border-white/10"><ZoomIn className="w-4 h-4" /></button>
        <span className="ml-1">Zoom in for precise points — drag a point to adjust.</span>
        {pts.length > 0 && (
          <button onClick={() => setPts([])} className="ml-auto flex items-center gap-1 text-slate-300"><RotateCcw className="w-3.5 h-3.5" /> Clear</button>
        )}
      </div>

      {/* Photo + overlay */}
      <div className="rounded-xl border border-white/10 overflow-auto max-h-[70vh] bg-black">
        <div className="relative select-none" style={{ width: `${zoom * 100}%` }}>
          <img
            src={photo.src}
            alt={photo.label}
            draggable={false}
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="block w-full h-auto"
          />
          {nat && (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${nat.w} ${nat.h}`}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              {objects.map((o, i) => (
                <rect
                  key={i}
                  x={o.box.x * nat.w}
                  y={o.box.y * nat.h}
                  width={o.box.w * nat.w}
                  height={o.box.h * nat.h}
                  fill="none"
                  stroke="#38bdf8"
                  strokeOpacity={0.6}
                  strokeDasharray={`${sw * 3} ${sw * 2}`}
                  strokeWidth={sw * 0.6}
                  pointerEvents="none"
                />
              ))}
              {scale && mode === 'measure' && line(scale.a, scale.b, '#f59e0b', `ref ${scale.realCm} cm`, false)}
              {pts.length === 1 && (
                <circle cx={pts[0].x} cy={pts[0].y} r={sw * 5} fill="#10b98133" stroke={mode === 'scale' ? '#f59e0b' : '#10b981'} strokeWidth={sw * 0.8} data-idx={0} />
              )}
              {pts.length === 2 &&
                line(
                  pts[0],
                  pts[1],
                  mode === 'scale' ? '#f59e0b' : '#10b981',
                  mode === 'scale' ? `${realForRef ?? '?'} cm` : current && 'cm' in current ? `${current.cm} cm` : null,
                  true
                )}
            </svg>
          )}
        </div>
      </div>

      {/* Auto sizes of detected objects */}
      {scale && objects.length > 0 && nat && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-semibold text-slate-300 mb-2">Detected objects — size from the detection box</p>
          <div className="space-y-1">
            {objects.map((o, i) => {
              const d = boxDimsCm(o.box, nat.w, nat.h, scale.pxPerCm);
              return d ? (
                <p key={i} className="text-xs text-slate-300">
                  {OBJECT_LABEL[o.type] ?? o.label}: ~{d.heightCm} cm tall × {d.widthCm} cm wide
                </p>
              ) : null;
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Boxes are loose (±5–10 %) and only right if the object is at the reference’s distance. Use “Start from … box”
            above and drag the points onto the exact edges for an accurate value.
          </p>
        </div>
      )}
    </div>
  );
}
