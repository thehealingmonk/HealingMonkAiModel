import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Wallet, CreditCard, Smartphone, IndianRupee, CheckCircle2 } from 'lucide-react';
import { Patient, ManualPaymentMethod, listPatients, recordPayment } from '@/services/api';
import { formatMoney } from '@/utils/formatter';

const METHODS: { value: ManualPaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'cash', label: 'Cash', icon: <Wallet className="w-4 h-4" /> },
  { value: 'upi', label: 'UPI', icon: <Smartphone className="w-4 h-4" /> },
  { value: 'card', label: 'Card', icon: <CreditCard className="w-4 h-4" /> },
];

// Full-page manual billing for reception: pick the client, type how much they
// paid and by which method, add a service/notes, and record it. The payment then
// shows up in Billing (Collections) with the patient info and amount.
export default function ReceptionBilling() {
  const navigate = useNavigate();
  const location = useLocation();
  const preset = (location.state as { patient?: Patient } | null)?.patient ?? null;

  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(preset);

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ManualPaymentMethod>('cash');
  const [service, setService] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

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
      setDone(true);
      // Give a beat of visual confirmation, then go to the Billing list.
      setTimeout(() => navigate('/reception/collections'), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record payment');
      setSaving(false);
    }
  };

  return (
    <div className="hm-page-enter max-w-3xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 font-medium mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <IndianRupee className="w-6 h-6 text-emerald-600" /> Record payment
        </h2>
        <p className="text-slate-500 text-sm">Manually bill a client for a service or session.</p>
      </div>

      {done ? (
        <div className="bg-white border border-emerald-200 rounded-2xl shadow-sm p-10 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-slate-900">Payment recorded</p>
          <p className="text-slate-500 text-sm">
            {formatMoney(Math.round(Number(amount) * 100))} · {selected?.name}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: patient */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <label className="block text-sm font-semibold text-slate-800 mb-3">1 · Patient</label>
            {selected ? (
              <div className="flex items-center justify-between px-4 py-3 border border-emerald-200 bg-emerald-50 rounded-xl">
                <div>
                  <p className="font-semibold text-slate-900">{selected.name}</p>
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
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {patients.length === 0 ? (
                    <p className="text-sm text-slate-400 px-3 py-6 text-center">No patients found.</p>
                  ) : (
                    patients.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between hover:bg-slate-50"
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

          {/* Right: bill details */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">2 · Amount paid (₹)</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={`${inputCls} pl-10 text-lg font-semibold`}
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Payment method</label>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
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

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Service / for (optional)</label>
              <input
                className={inputCls}
                placeholder="e.g. Physiotherapy session, Posture assessment"
                value={service}
                onChange={(e) => setService(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-2">Notes (optional)</label>
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

            <button
              type="submit"
              disabled={saving || !selected || !amountValid}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : amountValid ? `Record ${formatMoney(Math.round(Number(amount) * 100))}` : 'Record payment'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm';
