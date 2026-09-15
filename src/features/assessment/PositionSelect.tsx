import { useState, useEffect, useMemo, useRef } from 'react';
import { CLINICAL_ASSESSMENTS } from '@/lib/clinicalKnowledge';
import { initializePoseLandmarker } from '@/lib/poseDetection';
import PoseIllustration from '@/components/common/PoseIllustration';
import PageShell from '@/components/common/PageShell';
import {
  CustomPosition, listCustomPositions, createCustomPosition, deleteCustomPosition,
} from '@/services/api';
import {
  CheckCircle2, ChevronLeft, AlertCircle, Activity, ArrowRight, LayoutGrid, Plus, Trash2, X, Upload, ImageIcon, Loader2,
} from 'lucide-react';

interface Props {
  initial?: string[];
  onBack: () => void;
  onStart: (assessmentIds: string[]) => void;
}

// Sentinel tab id for the "All" overview (every category at once).
const ALL_TAB = '__all__';

// Downscale + JPEG-encode an uploaded image so the stored reference stays small.
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

export default function PositionSelect({ initial, onBack, onStart }: Props) {
  const defaults = CLINICAL_ASSESSMENTS.filter((a) => a.defaultSelected).map((a) => a.id);
  const [selected, setSelected] = useState<string[]>(initial?.length ? initial : defaults);
  const [error, setError] = useState('');

  // Active category tab (a body region) or the "All" overview.
  const [tab, setTab] = useState<string>(ALL_TAB);
  // Clinic-added reference positions (loaded from the server).
  const [customs, setCustoms] = useState<CustomPosition[]>([]);
  // Add-position modal (null = closed); pre-fills the category.
  const [adding, setAdding] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Warm up the (multi-MB) pose model now, while the doctor is picking positions.
  useEffect(() => {
    initializePoseLandmarker().catch(() => {
      /* Non-fatal here; the capture screen retries and surfaces any error. */
    });
  }, []);

  // Load the clinic's custom reference positions.
  useEffect(() => {
    listCustomPositions()
      .then((r) => setCustoms(r.positions))
      .catch(() => {
        /* non-fatal — the built-in positions still work */
      });
  }, []);

  // Categories = the built-in body regions (in first-appearance order) plus any
  // category that only exists as a custom position.
  const categories = useMemo(() => {
    const order: string[] = [];
    for (const a of CLINICAL_ASSESSMENTS) if (!order.includes(a.bodyRegion)) order.push(a.bodyRegion);
    for (const c of customs) if (!order.includes(c.category)) order.push(c.category);
    return order;
  }, [customs]);

  const posesByCat = useMemo(() => {
    const map: Record<string, typeof CLINICAL_ASSESSMENTS> = {};
    for (const a of CLINICAL_ASSESSMENTS) (map[a.bodyRegion] ||= []).push(a);
    return map;
  }, []);

  const customsByCat = useMemo(() => {
    const map: Record<string, CustomPosition[]> = {};
    for (const c of customs) (map[c.category] ||= []).push(c);
    return map;
  }, [customs]);

  const toggle = (id: string) => {
    setError('');
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const selectAll = () => setSelected(CLINICAL_ASSESSMENTS.map((a) => a.id));
  const clearAll = () => setSelected(defaults);

  const removeCustom = async (id: string) => {
    if (!window.confirm('Delete this custom position?')) return;
    setDeletingId(id);
    try {
      await deleteCustomPosition(id);
      setCustoms((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete position');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStart = () => {
    if (selected.length === 0) {
      setError('Please select at least one position to capture.');
      return;
    }
    // Keep the knowledge-base order so the full-body shot is captured first.
    // (Custom positions are reference-only and are never sent to the capture flow.)
    const ordered = CLINICAL_ASSESSMENTS.filter((a) => selected.includes(a.id)).map((a) => a.id);
    onStart(ordered);
  };

  const isAll = tab === ALL_TAB;
  const shownCategories = isAll ? categories : [tab];

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
          <p className="text-slate-500">Browse by category, tap the poses to capture, or add your own reference.</p>
        </div>
      </div>

      {/* Category tabs — "All" first, then every body region. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setTab(ALL_TAB)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            isAll
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> All
        </button>
        {categories.map((c) => {
          const count = (posesByCat[c]?.length ?? 0) + (customsByCat[c]?.length ?? 0);
          return (
            <button
              key={c}
              onClick={() => setTab(c)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === c
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm shadow-emerald-500/30'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
              }`}
            >
              {c}
              {count > 0 && (
                <span className={`ml-1.5 text-[11px] ${tab === c ? 'text-white/80' : 'text-emerald-600'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-500">{selected.length} selected</p>
        <div className="flex gap-2 text-sm">
          <button onClick={selectAll} className="text-emerald-600 hover:underline">Select all</button>
          <span className="text-slate-300">|</span>
          <button onClick={clearAll} className="text-slate-500 hover:underline">Reset</button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Category sections */}
      <div className="mb-28 space-y-8">
        {shownCategories.map((cat) => {
          const poses = posesByCat[cat] ?? [];
          const custom = customsByCat[cat] ?? [];
          return (
            <section key={cat}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-4 w-1.5 rounded-sm bg-emerald-500" />
                  <h2 className="text-lg font-semibold text-slate-900">{cat}</h2>
                  <span className="text-sm text-slate-400">
                    · {poses.length + custom.length} position{poses.length + custom.length === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  onClick={() => setAdding(cat)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-emerald-400/50 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                >
                  <Plus className="h-4 w-4" /> Add position
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {poses.map((a) => {
                  const active = selected.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggle(a.id)}
                      className={`relative overflow-hidden rounded-2xl border-2 bg-white text-left shadow-sm transition-all ${
                        active ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300 hover:shadow-md'
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
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] capitalize text-slate-600">{a.view} view</span>
                        </div>
                      </div>
                    </button>
                  );
                })}

                {/* Custom reference positions (not AI-captured). */}
                {custom.map((c) => (
                  <div
                    key={c.id}
                    className="group relative overflow-hidden rounded-2xl border-2 border-slate-200 bg-white text-left shadow-sm"
                  >
                    <span className="absolute left-2 top-2 z-10 rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Reference
                    </span>
                    <button
                      onClick={() => removeCustom(c.id)}
                      disabled={deletingId === c.id}
                      title="Delete position"
                      className="absolute right-2 top-2 z-10 rounded-lg bg-rose-600/90 p-1.5 text-white opacity-0 transition-opacity hover:bg-rose-600 group-hover:opacity-100"
                    >
                      {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                    <div className="aspect-[3/4] bg-slate-50">
                      <img src={c.imageData} alt={c.name} className="h-full w-full object-contain" />
                    </div>
                    <div className="border-t border-slate-100 p-3">
                      <p className="text-sm font-semibold leading-tight text-slate-900">{c.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Custom reference</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
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

      {adding !== null && (
        <AddPositionModal
          category={adding === ALL_TAB ? categories[0] ?? '' : adding}
          categories={categories}
          onClose={() => setAdding(null)}
          onAdded={(pos) => {
            setCustoms((prev) => [pos, ...prev]);
            setAdding(null);
            setTab(pos.category);
          }}
        />
      )}
    </PageShell>
  );
}

// Add a custom reference position (name + category + image) to the library.
function AddPositionModal({
  category,
  categories,
  onClose,
  onAdded,
}: {
  category: string;
  categories: string[];
  onClose: () => void;
  onAdded: (pos: CustomPosition) => void;
}) {
  const [name, setName] = useState('');
  const [cat, setCat] = useState(category || categories[0] || '');
  const [customCat, setCustomCat] = useState('');
  const [preview, setPreview] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setError('');
    try {
      setPreview(await fileToDataUrl(files[0]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read image');
    }
  };

  const finalCat = cat === '__other__' ? customCat.trim() : cat;

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Enter a name for the position.');
    if (!finalCat) return setError('Choose or type a category.');
    if (!preview) return setError('Upload a reference image.');
    setSaving(true);
    try {
      const { position } = await createCustomPosition({ category: finalCat, name: name.trim(), imageData: preview });
      onAdded(position);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the position');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:py-10">
      <div className="my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Plus className="h-5 w-5 text-emerald-600" /> Add position
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Wall angel"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Category</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__other__">Other (new category)…</option>
            </select>
            {cat === '__other__' && (
              <input
                value={customCat}
                onChange={(e) => setCustomCat(e.target.value)}
                placeholder="New category name (e.g. Wrist)"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">Reference image</label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files)} />
            {preview ? (
              <div className="relative overflow-hidden rounded-xl border border-slate-200">
                <img src={preview} alt="Preview" className="max-h-56 w-full object-contain bg-slate-50" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow hover:bg-white"
                >
                  <Upload className="h-3.5 w-3.5" /> Change
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 py-10 text-slate-400 transition-colors hover:border-emerald-400 hover:text-slate-600"
              >
                <ImageIcon className="mb-1.5 h-7 w-7" />
                Click to upload a reference image
              </button>
            )}
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:bg-slate-300"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving…' : 'Add position'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
