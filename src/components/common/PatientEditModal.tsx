import { useState } from 'react';
import { X, UserCog } from 'lucide-react';
import { Patient, updatePatient } from '@/services/api';

interface Props {
  patient: Patient;
  onClose: () => void;
  /** Called with the corrected patient so the caller can refresh its view. */
  onSaved: (patient: Patient) => void;
}

const PAIN_OPTIONS = ['Neck', 'Shoulder', 'Upper Back', 'Lower Back', 'Hip', 'Knee', 'Ankle'];

// Correct a wrong patient entry from anywhere the record is shown (admin table,
// admin/doctor profile). Pre-fills the current values, saves only the intake
// fields — the clinic Patient ID and assigned doctor are managed elsewhere.
export default function PatientEditModal({ patient, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: patient.name ?? '',
    age: patient.age != null ? String(patient.age) : '',
    gender: patient.gender ?? '',
    mobile: patient.mobile ?? '',
    email: patient.email ?? '',
    height: patient.height != null ? String(patient.height) : '',
    weight: patient.weight != null ? String(patient.weight) : '',
    complaint: patient.complaint ?? '',
  });
  const [painAreas, setPainAreas] = useState<string[]>(patient.painAreas ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const togglePain = (area: string) =>
    setPainAreas((p) => (p.includes(area) ? p.filter((a) => a !== area) : [...p, area]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Patient name is required.');
    setSaving(true);
    try {
      const { patient: updated } = await updatePatient(patient.id, { ...form, painAreas });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update patient');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 sm:py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 hm-page-enter">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <UserCog className="w-5 h-5 text-emerald-600" /> Edit patient
            <span className="text-sm font-mono text-slate-400">{patient.patientId}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full name *">
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Age">
                <input className={inputCls} type="number" value={form.age} onChange={(e) => set('age', e.target.value)} />
              </Field>
              <Field label="Gender">
                <select className={inputCls} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </Field>
            </div>
            <Field label="Mobile">
              <input className={inputCls} value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
            </Field>
            <Field label="Email">
              <input className={inputCls} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Height (cm)">
              <input className={inputCls} type="number" value={form.height} onChange={(e) => set('height', e.target.value)} />
            </Field>
            <Field label="Weight (kg)">
              <input className={inputCls} type="number" value={form.weight} onChange={(e) => set('weight', e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Problem / Pain area(s)</p>
            <div className="flex flex-wrap gap-2">
              {PAIN_OPTIONS.map((area) => {
                const active = painAreas.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => togglePain(area)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      active ? 'bg-red-600 border-red-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-red-300'
                    }`}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </div>

          <Field label="Chief complaint / notes">
            <textarea
              rows={2}
              className={inputCls}
              value={form.complaint}
              onChange={(e) => set('complaint', e.target.value)}
            />
          </Field>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
