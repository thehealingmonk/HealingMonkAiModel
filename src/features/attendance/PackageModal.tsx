import { useEffect, useMemo, useState } from 'react';
import { X, Search, Wallet, CreditCard, Smartphone, Clock, CalendarCheck, IndianRupee } from 'lucide-react';
import { Patient, PatientPackage, ManualPaymentMethod, listPatients, createPackage } from '@/services/api';
import { istDay, addDays, packageEndDay, formatDay } from '@/lib/packageDates';

interface Props {
  onClose: () => void;
  onSaved: (pkg: PatientPackage) => void;
  /** Pre-select the patient (e.g. enrolling straight from their profile). */
  presetPatient?: Patient | null;
  /** Renewing: copies the plan and starts the day after it ends (or today if lapsed). */
  renewFrom?: PatientPackage | null;
}

interface Picked {
  id: string;
  name: string;
  code: string;
}

// One-tap starting points for the common clinic plans; everything stays editable.
const PRESETS = [
  { name: 'Monthly package – 12 sessions', sessions: 12 },
  { name: 'Monthly package – 8 sessions', sessions: 8 },
  { name: 'Monthly package – Unlimited', sessions: 0 },
];

const METHODS: { value: ManualPaymentMethod | 'none'; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Wallet className="w-4 h-4" /> },
  { value: 'upi', label: 'UPI', icon: <Smartphone className="w-4 h-4" /> },
  { value: 'card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
  { value: 'none', label: 'Later', icon: <Clock className="w-4 h-4" /> },
];

// Enrol a patient in a monthly package (or renew one). The fee, if paid now,
// is recorded as a normal desk payment so it also shows up in Collections.
export default function PackageModal({ onClose, onSaved, presetPatient = null, renewFrom = null }: Props) {
  const today = istDay();
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Picked | null>(
    renewFrom
      ? { id: renewFrom.patient, name: renewFrom.patientName || 'Patient', code: renewFrom.patientCode || '' }
      : presetPatient
      ? { id: presetPatient.id, name: presetPatient.name, code: presetPatient.patientId || '' }
      : null
  );
  const fixedPatient = !!(renewFrom || presetPatient);

  const [name, setName] = useState(renewFrom?.name || PRESETS[0].name);
  const [sessions, setSessions] = useState(String(renewFrom ? renewFrom.sessionsTotal : PRESETS[0].sessions));
  const [months, setMonths] = useState(1);
  const [startDay, setStartDay] = useState(
    renewFrom && renewFrom.endDay >= today ? addDays(renewFrom.endDay, 1) : today
  );
  const [amount, setAmount] = useState(renewFrom?.amount ? String(renewFrom.amount / 100) : '');
  const [method, setMethod] = useState<ManualPaymentMethod | 'none'>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    const t = setTimeout(() => {
      listPatients({ q: query, scope: 'all' })
        .then((r) => !cancelled && setPatients(r.patients))
        .catch(() => !cancelled && setPatients([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, selected]);

  const endDay = useMemo(() => (startDay ? packageEndDay(startDay, months) : ''), [startDay, months]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selected) return setError('Please select the patient.');
    if (!name.trim()) return setError('Give the package a name.');
    if (!startDay) return setError('Pick a start date.');
    setSaving(true);
    try {
      const r = await createPackage({
        patientId: selected.id,
        name: name.trim(),
        sessionsTotal: Number(sessions) || 0,
        months,
        startDay,
        amount: Number(amount) || 0,
        method,
        notes: notes.trim(),
      });
      onSaved(r.package);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save package');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 sm:py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 hm-page-enter">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-emerald-600" /> {renewFrom ? 'Renew package' : 'New monthly package'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-5">
          {/* Patient */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Patient</label>
            {selected ? (
              <div className="flex items-center justify-between px-3 py-2 border border-emerald-200 bg-emerald-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">{selected.name}</p>
                  <p className="text-xs text-slate-500">{selected.code || '—'}</p>
                </div>
                {!fixedPatient && (
                  <button type="button" onClick={() => setSelected(null)} className="text-sm text-emerald-700 hover:text-emerald-800 font-medium">
                    Change
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    autoFocus
                    className={`${inputCls} pl-9`}
                    placeholder="Search by name…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {patients.length === 0 ? (
                    <p className="text-sm text-slate-400 px-3 py-4 text-center">No patients found.</p>
                  ) : (
                    patients.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setSelected({ id: p.id, name: p.name, code: p.patientId || '' })}
                        className="w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50"
                      >
                        <span className="font-medium text-slate-900">{p.name}</span>
                        <span className="text-xs text-slate-400">{p.patientId || p.mobile}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Package</label>
            {!renewFrom && (
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setName(p.name);
                      setSessions(String(p.sessions));
                    }}
                    className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                      name === p.name ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p.sessions ? `${p.sessions} sessions` : 'Unlimited'}
                  </button>
                ))}
              </div>
            )}
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly physio package" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Sessions (0 = unlimited)</label>
              <input type="number" min="0" inputMode="numeric" className={inputCls} value={sessions} onChange={(e) => setSessions(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Duration</label>
              <select className={inputCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[1, 2, 3, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} month{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Start date</label>
            <input type="date" className={inputCls} value={startDay} onChange={(e) => setStartDay(e.target.value)} />
            {endDay && <p className="text-xs text-slate-500 mt-1.5">Valid until {formatDay(endDay)}</p>}
          </div>

          {/* Fee */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Package fee (₹)</label>
            <div className="relative mb-2">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className={`${inputCls} pl-9`}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    method === m.value ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              {method === 'none' ? 'No payment recorded now — bill it later from Billing.' : 'Recorded as a paid bill in Collections.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Notes (optional)</label>
            <textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

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
              disabled={saving || !selected}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : renewFrom ? 'Renew' : 'Start package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
