import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  ImageIcon,
  Trash2,
  Download,
  Eye,
  Loader2,
  X,
  Paperclip,
} from 'lucide-react';
import {
  DocumentCategory,
  NewDocument,
  PatientDocumentMeta,
  listPatientDocuments,
  uploadPatientDocuments,
  getPatientDocument,
  deletePatientDocument,
} from '@/services/api';

// Client-side guard so we fail fast before hitting the server limit (~3.7 MB).
const MAX_FILE_BYTES = 3.7 * 1024 * 1024;

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  report: 'Report',
  xray: 'X-ray',
  prescription: 'Prescription',
  scan: 'Scan',
  other: 'Other',
};

const CATEGORY_OPTIONS: DocumentCategory[] = ['report', 'xray', 'prescription', 'scan', 'other'];

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function prettySize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string) {
  return mime.startsWith('image/');
}

/**
 * A patient's uploaded files (X-rays, prescriptions, outside reports…). Reception,
 * doctor and admin can all add multiple files, preview and remove them. Files are
 * loaded metadata-first; the full payload is fetched only when previewing or
 * downloading, so a patient with many documents stays fast.
 */
export default function PatientDocuments({ patientId }: { patientId: string }) {
  const [docs, setDocs] = useState<PatientDocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('report');
  const [preview, setPreview] = useState<{ name: string; mime: string; data: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { documents } = await listPatientDocuments(patientId);
      setDocs(documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load documents');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file
    if (files.length === 0) return;

    setError('');
    const tooBig = files.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`"${tooBig.name}" is too large (max ~3.7 MB).`);
      return;
    }
    const bad = files.find((f) => !(f.type.startsWith('image/') || f.type === 'application/pdf'));
    if (bad) {
      setError(`"${bad.name}" is not an image or PDF.`);
      return;
    }

    setUploading(true);
    try {
      const payload: NewDocument[] = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          mime: f.type,
          size: f.size,
          category,
          data: await readAsDataURL(f),
        }))
      );
      const { documents } = await uploadPatientDocuments(patientId, payload);
      setDocs((prev) => [...documents, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openPreview = async (doc: PatientDocumentMeta) => {
    setBusyId(doc.id);
    setError('');
    try {
      const { document } = await getPatientDocument(patientId, doc.id);
      if (isImage(document.mime)) {
        setPreview({ name: document.name, mime: document.mime, data: document.data });
      } else {
        // PDFs / other: open in a new tab via a blob so the browser viewer handles it.
        const w = window.open();
        if (w) w.document.write(`<iframe src="${document.data}" style="border:0;width:100%;height:100%"></iframe>`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open file');
    } finally {
      setBusyId(null);
    }
  };

  const download = async (doc: PatientDocumentMeta) => {
    setBusyId(doc.id);
    setError('');
    try {
      const { document } = await getPatientDocument(patientId, doc.id);
      const a = window.document.createElement('a');
      a.href = document.data;
      a.download = document.name || 'document';
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download file');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc: PatientDocumentMeta) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    setBusyId(doc.id);
    setError('');
    try {
      await deletePatientDocument(patientId, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete file');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : 'Upload files'}
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={onPick}
            className="hidden"
          />
        </div>
        <span className="text-xs text-gray-400">Images or PDF · up to ~3.7 MB each</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-center text-gray-400 text-sm">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
          <Paperclip className="w-6 h-6 mx-auto mb-2 text-gray-300" />
          No documents yet. Upload X-rays, prescriptions or outside reports.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {docs.map((doc) => {
            const busy = busyId === doc.id;
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm"
              >
                <div className={`flex-shrink-0 rounded-lg p-2.5 ${isImage(doc.mime) ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  {isImage(doc.mime) ? (
                    <ImageIcon className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <FileText className="w-5 h-5 text-rose-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate" title={doc.name}>
                    {doc.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    <span className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 mr-1.5">
                      {CATEGORY_LABEL[doc.category] ?? 'Other'}
                    </span>
                    {prettySize(doc.size)}
                    {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  <IconBtn title="Preview" onClick={() => openPreview(doc)} disabled={busy}>
                    <Eye className="w-4 h-4" />
                  </IconBtn>
                  <IconBtn title="Download" onClick={() => download(doc)} disabled={busy}>
                    <Download className="w-4 h-4" />
                  </IconBtn>
                  <IconBtn title="Delete" onClick={() => remove(doc)} disabled={busy} danger>
                    <Trash2 className="w-4 h-4" />
                  </IconBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.data}
            alt={preview.name}
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
          />
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors disabled:opacity-40 ${
        danger ? 'text-rose-500 hover:bg-rose-50' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}
