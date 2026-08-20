import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Upload, Trash2, Save, Check, ImageIcon, Plus } from 'lucide-react';
import {
  IDEAL_POSTURE_CONDITIONS,
  IdealPostureImage,
  listIdealPostures,
  saveIdealPosture,
} from '@/services/api';

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

export default function IdealPostures({ onBack }: Props) {
  const [condition, setCondition] = useState<string>(IDEAL_POSTURE_CONDITIONS[0]);
  // Images per condition, kept in memory so switching tabs preserves edits.
  const [byCondition, setByCondition] = useState<Record<string, IdealPostureImage[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const { sets } = await listIdealPostures();
        const map: Record<string, IdealPostureImage[]> = {};
        for (const s of sets) map[s.condition] = s.images;
        setByCondition(map);
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

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveIdealPosture(condition, images);
      setSavedAt((prev) => ({ ...prev, [condition]: true }));
      setTimeout(() => setSavedAt((prev) => ({ ...prev, [condition]: false })), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
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

      {/* Condition tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {IDEAL_POSTURE_CONDITIONS.map((c) => {
          const count = (byCondition[c] ?? []).length;
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
      </div>

      {error && (
        <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

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
    </div>
  );
}
