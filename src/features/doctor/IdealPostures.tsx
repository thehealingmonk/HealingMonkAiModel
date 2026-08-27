import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Upload, Trash2, Save, Check, ImageIcon, Plus, CheckCircle2, LayoutGrid, FolderPlus, Sparkles } from 'lucide-react';
import {
  IDEAL_POSTURE_CONDITIONS,
  IdealPostureImage,
  listIdealPostures,
  saveIdealPosture,
} from '@/services/api';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';
import PoseIllustration from '@/components/common/PoseIllustration';

interface Props {
  onBack: () => void;
}

// Downscale an uploaded image to a sensible reference size and re-encode as
// JPEG so the stored library stays small (a few images baked into every report).
function fileToDataUrl(file: File, maxPx = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// Built-in reference postures suggested per category. Each id is a capture pose
// from CLINICAL_ASSESSMENTS; its PoseIllustration is rendered as a ready-made
// "ideal" reference the doctor can add to the library in one click — so every
// category ships with sensible defaults instead of starting empty.
const CATEGORY_DEFAULT_POSES: Record<string, string[]> = {
  Neck: ['forward_head', 'head_tilt', 'cervical_flexion', 'cervical_extension', 'seated_forward_head'],
  Shoulder: ['shoulder_level', 'shoulder_flexion_rom', 'shoulder_abduction_rom', 'shoulder_extension_rom'],
  'Upper Back': ['thoracic_kyphosis', 'lateral_spine', 'seated_slump'],
  'Lower Back': ['trunk_forward_flexion', 'trunk_extension', 'trunk_lateral_flexion', 'anterior_pelvic_tilt', 'scoliosis_adams'],
  Hip: ['pelvic_level', 'hip_abduction', 'hip_flexion_rom', 'supine_slr', 'supine_knee_to_chest', 'single_leg_balance'],
  Knee: ['knee_alignment', 'squat_depth', 'knee_flexion_active', 'lunge_depth', 'overhead_squat'],
  Ankle: ['ankle_dorsiflexion', 'squat_depth'],
};

// Resolve the default reference poses for a category. Custom categories (added
// by the doctor) have no preset, so we fall back to any assessment whose body
// region or name matches the category text.
function defaultPosesFor(condition: string): string[] {
  const preset = CATEGORY_DEFAULT_POSES[condition];
  if (preset) return preset;
  const q = condition.trim().toLowerCase();
  if (!q) return [];
  return CLINICAL_ASSESSMENTS.filter(
    (a) => a.bodyRegion.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
  ).map((a) => a.id);
}

// Rasterise a rendered PoseIllustration <svg> into a JPEG data URL so it can be
// stored in the library exactly like an uploaded photo. The illustration is
// inline (no external refs) so the canvas is never tainted.
function svgToJpegDataUrl(svg: SVGSVGElement, targetH = 560, quality = 0.85, bg = '#f8fafc'): Promise<string> {
  return new Promise((resolve, reject) => {
    const rect = svg.getBoundingClientRect();
    const w = rect.width || 300;
    const h = rect.height || 400;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const xml = new XMLSerializer().serializeToString(clone);
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const img = new Image();
    img.onload = () => {
      const scale = targetH / h;
      const outW = Math.round(w * scale);
      const outH = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Could not render illustration'));
    img.src = src;
  });
}

// Sentinel tab id for the "All" overview (every category's images at once).
const ALL_TAB = '__all__';

export default function IdealPostures({ onBack }: Props) {
  // The active tab: a category name, or ALL_TAB for the overview.
  const [condition, setCondition] = useState<string>(ALL_TAB);
  // The category list = built-in defaults + any custom ones (from the DB or
  // added this session). Editable so doctors can add their own categories.
  const [conditions, setConditions] = useState<string[]>([...IDEAL_POSTURE_CONDITIONS]);
  // Images per condition, kept in memory so switching tabs preserves edits.
  const [byCondition, setByCondition] = useState<Record<string, IdealPostureImage[]>>({});
  // Selected capture-pose ids per condition (pre-checked from what was saved before).
  const [posesByCondition, setPosesByCondition] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Record<string, boolean>>({});
  // Default reference poses already pulled into a category this session, so the
  // "Add" button on each illustration flips to "Added".
  const [addedDefaults, setAddedDefaults] = useState<Record<string, string[]>>({});
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const { sets } = await listIdealPostures();
        const map: Record<string, IdealPostureImage[]> = {};
        const poseMap: Record<string, string[]> = {};
        for (const s of sets) {
          map[s.condition] = s.images;
          poseMap[s.condition] = s.poses ?? [];
        }
        setByCondition(map);
        setPosesByCondition(poseMap);
        // Surface any custom categories saved earlier (beyond the defaults).
        setConditions((prev) =>
          Array.from(new Set([...prev, ...sets.map((s) => s.condition)]))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load library');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const images = byCondition[condition] ?? [];
  const setImages = (next: IdealPostureImage[]) =>
    setByCondition((prev) => ({ ...prev, [condition]: next }));

  const selectedPoses = posesByCondition[condition] ?? [];
  const togglePose = (id: string) =>
    setPosesByCondition((prev) => {
      const current = prev[condition] ?? [];
      const next = current.includes(id) ? current.filter((p) => p !== id) : [...current, id];
      return { ...prev, [condition]: next };
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    try {
      const remaining = 8 - images.length;
      const picked = Array.from(files).slice(0, Math.max(0, remaining));
      const added = await Promise.all(picked.map(async (f) => ({ label: '', imageData: await fileToDataUrl(f) })));
      setImages([...images, ...added]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process image');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  // Convert a built-in reference illustration to an image and add it to the
  // current category's library (in memory — the doctor still presses Save to
  // persist it as the default that auto-fills matching reports).
  const addDefault = async (poseId: string, svg: SVGSVGElement) => {
    setError('');
    if (images.length >= 8) {
      setError('This category already has the maximum of 8 images.');
      return;
    }
    try {
      const imageData = await svgToJpegDataUrl(svg);
      const label = CLINICAL_ASSESSMENTS.find((a) => a.id === poseId)?.name ?? '';
      setImages([...images, { label, imageData }]);
      setAddedDefaults((prev) => ({
        ...prev,
        [condition]: [...(prev[condition] ?? []), poseId],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add illustration');
    }
  };

  const isAll = condition === ALL_TAB;

  // Add a new custom category and switch to it. It persists once you save images
  // (the API upserts by category name), and re-appears on the next visit.
  const addCategory = () => {
    const name = window.prompt('New category name (e.g. Wrist, Full Body, Scoliosis)')?.trim();
    if (!name) return;
    const existing = conditions.find((c) => c.toLowerCase() === name.toLowerCase());
    if (existing) {
      setCondition(existing);
      return;
    }
    setConditions((prev) => [...prev, name]);
    setCondition(name);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveIdealPosture(condition, images, selectedPoses);
      setSavedAt((prev) => ({ ...prev, [condition]: true }));
      setTimeout(() => setSavedAt((prev) => ({ ...prev, [condition]: false })), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // Add images to any category directly from the "All" overview and persist them
  // immediately, so a doctor can build up every category (Shoulder, Neck, …) in
  // one place without switching tabs.
  const addImagesTo = async (cond: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError('');
    try {
      const existing = byCondition[cond] ?? [];
      const remaining = 8 - existing.length;
      if (remaining <= 0) {
        setError(`${cond} already has the maximum of 8 images.`);
        return;
      }
      const picked = Array.from(files).slice(0, remaining);
      const added = await Promise.all(
        picked.map(async (f) => ({ label: '', imageData: await fileToDataUrl(f) }))
      );
      const next = [...existing, ...added];
      setByCondition((prev) => ({ ...prev, [cond]: next }));
      setConditions((prev) => (prev.includes(cond) ? prev : [...prev, cond]));
      await saveIdealPosture(cond, next, posesByCondition[cond] ?? []);
      setSavedAt((prev) => ({ ...prev, [cond]: true }));
      setTimeout(() => setSavedAt((prev) => ({ ...prev, [cond]: false })), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add images');
    }
  };

  return (
    <div className="hm-page-enter max-w-4xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to patients
      </button>

      <div className="mb-6" data-reveal="fade">
        <h2 className="text-2xl font-bold tracking-tight text-white">Ideal Posture Library</h2>
        <p className="text-slate-400 text-sm">
          Curate the reference images for each condition once. They auto-appear in every report for a patient with that
          pain area — still editable per report.
        </p>
      </div>

      {/* Condition tabs — "All" overview first, then every category, then add. */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setCondition(ALL_TAB)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isAll
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30'
              : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <LayoutGrid className="w-3.5 h-3.5" /> All
        </button>
        {conditions.map((c) => {
          const count = (byCondition[c] ?? []).length + (posesByCondition[c] ?? []).length;
          return (
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
              {count > 0 && (
                <span className={`ml-1.5 text-[11px] ${condition === c ? 'text-white/80' : 'text-emerald-400'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={addCategory}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-emerald-400/40 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5" /> New category
        </button>
      </div>

      {error && (
        <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {isAll ? (
        <AllOverview
          conditions={conditions}
          byCondition={byCondition}
          savedAt={savedAt}
          onOpen={setCondition}
          onAddImages={addImagesTo}
        />
      ) : (
      <>
      <div className="glass-dark rounded-2xl p-5" data-reveal>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">
            {condition} <span className="text-slate-400 font-normal text-sm">· {images.length}/8 images</span>
          </h3>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={images.length >= 8}
              className="hm-lift inline-flex items-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-200 text-sm font-medium py-2 px-3 rounded-lg"
            >
              <Upload className="w-4 h-4" /> Add images
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="hm-lift inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold py-2 px-4 rounded-lg shadow-lg shadow-emerald-500/30 disabled:opacity-50"
            >
              {savedAt[condition] ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving…' : savedAt[condition] ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading library…</div>
        ) : images.length === 0 ? (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-white/15 rounded-xl py-12 text-center text-slate-400 hover:border-emerald-400/40 hover:text-slate-200 transition-colors"
          >
            <ImageIcon className="w-8 h-8 mx-auto mb-2 text-slate-500" />
            No ideal images for {condition} yet.
            <span className="block text-emerald-400 text-sm mt-1 inline-flex items-center gap-1 justify-center">
              <Plus className="w-3.5 h-3.5" /> Upload the reference postures
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {images.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-white/10 bg-slate-900/60 group">
                <div className="relative aspect-[3/4] bg-slate-950">
                  <img src={img.imageData} alt={img.label || `${condition} ideal ${i + 1}`} className="w-full h-full object-contain" />
                  <button
                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                    className="absolute top-1.5 right-1.5 bg-rose-600/90 hover:bg-rose-600 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  value={img.label}
                  onChange={(e) => setImages(images.map((im, j) => (j === i ? { ...im, label: e.target.value } : im)))}
                  placeholder="Label (e.g. Flexion ROM)"
                  className="w-full bg-transparent border-t border-white/10 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:bg-white/5"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Built-in default reference postures for this category */}
      <DefaultGallery
        condition={condition}
        added={addedDefaults[condition] ?? []}
        atMax={images.length >= 8}
        onAdd={addDefault}
      />

      {/* Tracked capture poses for this condition */}
      <div className="glass-dark rounded-2xl p-5 mt-5" data-reveal>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold text-white">
            Tracked poses{' '}
            <span className="text-slate-400 font-normal text-sm">· {selectedPoses.length} selected</span>
          </h3>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Pick the capture poses to track for {condition}. Previously-saved poses are already selected — tap to
          add or remove, then Save.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {CLINICAL_ASSESSMENTS.map((a) => {
            const active = selectedPoses.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => togglePose(a.id)}
                className={`relative overflow-hidden rounded-xl border text-left transition-all ${
                  active
                    ? 'border-emerald-400/70 ring-1 ring-emerald-400/40 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5 hover:border-emerald-400/40'
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
                </div>
              </button>
            );
          })}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// A gallery of built-in reference postures for the active category. Each card
// renders the anatomical illustration and an "Add" button that bakes it into
// the library — giving every category ready-made defaults to start from.
function DefaultGallery({
  condition,
  added,
  atMax,
  onAdd,
}: {
  condition: string;
  added: string[];
  atMax: boolean;
  onAdd: (poseId: string, svg: SVGSVGElement) => void;
}) {
  const poses = defaultPosesFor(condition);
  if (poses.length === 0) return null;

  return (
    <div className="glass-dark rounded-2xl p-5 mt-5" data-reveal>
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <h3 className="font-semibold text-white">Default reference postures</h3>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        Ready-made ideal-posture references for {condition}. Tap <span className="text-emerald-300">Add</span> to drop one
        into the library above, then Save so it auto-fills every matching report.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {poses.map((id) => (
          <DefaultPoseCard key={id} poseId={id} added={added.includes(id)} disabled={atMax} onAdd={onAdd} />
        ))}
      </div>
    </div>
  );
}

// One default-reference card. Holds a ref to its own illustration so the parent
// can rasterise exactly this <svg> when the doctor clicks Add.
function DefaultPoseCard({
  poseId,
  added,
  disabled,
  onAdd,
}: {
  poseId: string;
  added: boolean;
  disabled: boolean;
  onAdd: (poseId: string, svg: SVGSVGElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const meta = CLINICAL_ASSESSMENTS.find((a) => a.id === poseId);

  const handleAdd = () => {
    const svg = ref.current?.querySelector('svg');
    if (svg) onAdd(poseId, svg as unknown as SVGSVGElement);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div ref={ref} className="aspect-[3/4] bg-slate-950/40">
        <PoseIllustration pose={poseId} className="h-full w-full" />
      </div>
      <div className="border-t border-white/10 p-2">
        <p className="text-xs font-medium leading-tight text-white truncate" title={meta?.name}>
          {meta?.name ?? poseId}
        </p>
        <button
          type="button"
          onClick={handleAdd}
          disabled={added || disabled}
          className={`mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            added
              ? 'bg-emerald-500/15 text-emerald-300 cursor-default'
              : disabled
                ? 'border border-white/10 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30 hover:opacity-90'
          }`}
        >
          {added ? (
            <>
              <Check className="w-3.5 h-3.5" /> Added
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" /> Add
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// The "All" overview: every category in one place. Shows each category's saved
// reference images and lets the doctor add images to ANY category right here
// (uploaded images save immediately and auto-fill every matching patient report).
function AllOverview({
  conditions,
  byCondition,
  savedAt,
  onOpen,
  onAddImages,
}: {
  conditions: string[];
  byCondition: Record<string, IdealPostureImage[]>;
  savedAt: Record<string, boolean>;
  onOpen: (condition: string) => void;
  onAddImages: (condition: string, files: FileList | null) => void;
}) {
  const total = conditions.reduce((n, c) => n + (byCondition[c]?.length ?? 0), 0);

  return (
    <div className="space-y-5" data-reveal>
      <p className="text-sm text-slate-400">
        {total} image{total === 1 ? '' : 's'} across {conditions.length} categor
        {conditions.length === 1 ? 'y' : 'ies'}. Add images to any category below — they
        save automatically.
      </p>
      {conditions.map((c) => {
        const imgs = byCondition[c] ?? [];
        const full = imgs.length >= 8;
        return (
          <div key={c} className="glass-dark rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <button onClick={() => onOpen(c)} className="group flex items-center gap-2 text-left">
                <span className="w-1.5 h-4 bg-emerald-500 rounded-sm" />
                <h3 className="font-semibold text-white">{c}</h3>
                <span className="text-slate-400 text-sm">· {imgs.length}/8 images</span>
                {savedAt[c] && (
                  <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                    <Check className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                <span className="text-emerald-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Edit →
                </span>
              </button>
              <label
                className={`inline-flex items-center gap-1.5 text-sm font-medium py-1.5 px-3 rounded-lg cursor-pointer transition-colors ${
                  full
                    ? 'border border-white/10 text-slate-500 cursor-not-allowed'
                    : 'border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200'
                }`}
                title={full ? 'Maximum of 8 images' : `Add images to ${c}`}
              >
                <Upload className="w-4 h-4" /> Add to {c}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={full}
                  className="hidden"
                  onChange={(e) => {
                    onAddImages(c, e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            {imgs.length === 0 ? (
              <label className="block w-full border-2 border-dashed border-white/15 rounded-xl py-8 text-center text-slate-400 hover:border-emerald-400/40 hover:text-slate-200 transition-colors cursor-pointer">
                <ImageIcon className="w-7 h-7 mx-auto mb-1.5 text-slate-500" />
                No images for {c} yet — click to upload references.
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onAddImages(c, e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {imgs.map((img, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-white/10 bg-slate-900/60">
                    <div className="relative aspect-[3/4] bg-slate-950">
                      <img
                        src={img.imageData}
                        alt={img.label || `${c} ideal ${i + 1}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    {img.label && (
                      <p className="px-2 py-1.5 text-xs text-slate-300 truncate border-t border-white/10">
                        {img.label}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
