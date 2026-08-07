import { useEffect, useMemo, useState } from 'react';
import { X, Search, Wallet, CreditCard, Smartphone, IndianRupee } from 'lucide-react';
import { Patient, ManualPaymentMethod, listPatients, recordPayment } from '@/services/api';

interface Props {
  onClose: () => void;
  /** Called after a payment is recorded so the caller can refresh its list. */
  onRecorded: () => void;
  /** Optionally pre-select a patient (e.g. billing straight from a profile). */
  presetPatient?: Patient | null;
}

const METHODS: { value: ManualPaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Wallet className="w-4 h-4" /> },
  { value: 'upi', label: 'UPI', icon: <Smartphone className="w-4 h-4" /> },
  { value: 'card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
];

// Manual billing at the reception desk: pick the client, type how much they paid
// and by which method, add an optional service/notes, and record it. The payment
// then shows up in Collections with the patient info and amount. No auto-charge.
export default function RecordPaymentModal({ onClose, onRecorded, presetPatient = null }: Props) {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(presetPatient);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ManualPaymentMethod>('cash');
  const [service, setService] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Debounced patient search (skip while a patient is already chosen).
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

  const amountValid = useMemo(() => Number(amount) > 0, [amount]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selected) return setError('Please select the patient this bill is for.');
    if (!amountValid) return setError('Enter a valid amount greater than 0.');

    setSaving(true);
    try {
      await recordPayment({
        patientId: selected.id,
        amount: Number(amount),
        method,
        plan: service.trim(),
        notes: notes.trim(),
      });
      onRecorded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm p-4 sm:py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 hm-page-enter">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-emerald-600" /> Record payment
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
                  <p className="text-xs text-slate-500">
                    {selected.patientId || '—'}
                    {selected.mobile ? ` · ${selected.mobile}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm text-emerald-700 hover:text-emerald-800 font-medium"
                >
                  Change
                </button>
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
                        onClick={() => setSelected(p)}
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

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Amount paid (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className={`${inputCls} pl-9`}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Method */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Payment method</label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    method === m.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.icon}
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Service / plan */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Service / for (optional)</label>
            <input
              className={inputCls}
              placeholder="e.g. Physiotherapy session, Posture assessment"
              value={service}
              onChange={(e) => setService(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Notes (optional)</label>
            <textarea
              rows={2}
              className={inputCls}
              placeholder="Any extra detail for the receipt…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

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
              disabled={saving || !selected || !amountValid}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Record payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
