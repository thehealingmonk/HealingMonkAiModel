import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndianRupee, Wallet, CreditCard, Receipt, Plus, Pencil, Trash2, X, Loader2, Search, Hourglass } from 'lucide-react';
import {
  Payment, PaymentStatus, ManualPaymentMethod, PendingDue, listPayments, listDues, updatePayment, deletePayment,
} from '@/services/api';
import { formatDay } from '@/lib/packageDates';
import { formatDate, formatMoney } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import { useRowSelection } from '@/hooks/useRowSelection';
import { BulkBar, SelectCheckbox } from '@/components/ui/BulkBar';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';
import ModalPortal from '@/components/common/ModalPortal';
import { paymentMatches } from '@/utils/paymentSearch';

const STATUS_BADGE: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  created: 'bg-sky-100 text-sky-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-amber-100 text-amber-700',
};

// Reception "Collections": all-time money taken at the desk plus who paid, which
// doctor they're assigned to, and who collected it. Rows can be edited or
// deleted to fix mistakes, individually or in bulk. Totals come from the server
// aggregation (whole collection), so they stay accurate beyond the 300-row list.
export default function ReceptionCollections() {
  // Payments and pending package dues load together so editing/deleting a bill
  // refreshes the balances too.
  const { data, loading, refreshing, error: loadError, lastUpdated, refresh } = useLiveData(() =>
    Promise.all([listPayments(), listDues().catch(() => null)]).then(([pay, dues]) => ({ ...pay, dues }))
  );
  const navigate = useNavigate();
  const allPayments = data?.payments ?? [];
  const summary = data?.summary;
  const dues = data?.dues?.dues ?? [];
  const totalDue = data?.dues?.totalDue ?? 0;
  const [showDues, setShowDues] = useState(false);

  const collect = (d: PendingDue) =>
    navigate('/reception/billing', {
      state: {
        patient: { id: d.patient, name: d.patientName || 'Patient', patientId: d.patientCode, mobile: d.patientMobile },
        packageId: d.id,
      },
    });
  const [q, setQ] = useState('');
  const payments = allPayments.filter((p) => paymentMatches(p, q));

  const [editing, setEditing] = useState<Payment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const error = actionError || loadError;

  const sel = useRowSelection(payments.map((p) => p.id));

  // Fall back to summing the visible rows if the server summary is missing.
  const totalPaid = summary?.totalPaid ?? allPayments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const paidCount = summary?.paidCount ?? allPayments.filter((p) => p.status === 'paid').length;
  const cashPaid = summary?.cashPaid ?? 0;
  const onlinePaid = summary?.onlinePaid ?? 0;

  const removeOne = async (p: Payment) => {
    if (!window.confirm(`Delete this ${formatMoney(p.amount, p.currency)} payment for ${p.patientName || 'this patient'}? This cannot be undone.`)) return;
    setActionError('');
    setDeletingId(p.id);
    try {
      await deletePayment(p.id);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete payment');
    } finally {
      setDeletingId(null);
    }
  };

  const bulkDelete = async () => {
    const ids = sel.selectedVisible;
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected payment${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setActionError('');
    setBulkDeleting(true);
    try {
      for (const id of ids) await deletePayment(id);
      sel.clear();
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not delete selected payments');
    } finally {
      setBulkDeleting(false);
    }
  };

  const exportColumns = [
    { header: 'Date', value: (p: Payment) => formatDate(p.createdAt, true) },
    { header: 'Patient', value: (p: Payment) => p.patientName || '' },
    { header: 'Patient ID', value: (p: Payment) => p.patientCode || '' },
    { header: 'Assigned doctor', value: (p: Payment) => p.doctorName || '' },
    { header: 'Service', value: (p: Payment) => p.plan || '' },
    { header: 'Amount (INR)', value: (p: Payment) => (p.amount / 100).toFixed(2) },
    { header: 'Method', value: (p: Payment) => p.method },
    { header: 'Status', value: (p: Payment) => p.status },
    { header: 'Notes', value: (p: Payment) => p.notes || '' },
    { header: 'Collected by', value: (p: Payment) => p.collectedByName || '' },
  ];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Collections</h2>
          <p className="text-slate-500 text-sm">All-time money collected at reception.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/reception/billing')}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Record payment
          </button>
          <ExportButton filename="collections" columns={exportColumns} rows={payments} />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6" data-reveal>
        <StatCard icon={<IndianRupee className="w-5 h-5" />} label="Total collected" value={formatMoney(totalPaid)} tone="emerald" />
        <StatCard icon={<Receipt className="w-5 h-5" />} label="Payments" value={String(paidCount)} tone="slate" />
        <StatCard icon={<Wallet className="w-5 h-5" />} label="Cash" value={formatMoney(cashPaid)} tone="amber" />
        <StatCard icon={<CreditCard className="w-5 h-5" />} label="Online" value={formatMoney(onlinePaid)} tone="sky" />
        <button type="button" onClick={() => setShowDues((s) => !s)} className="text-left col-span-2 md:col-span-1">
          <StatCard
            icon={<Hourglass className="w-5 h-5" />}
            label={`Pending · ${dues.length} package${dues.length === 1 ? '' : 's'}`}
            value={formatMoney(totalDue)}
            tone="rose"
          />
        </button>
      </div>

      {/* Pending package fees — unpaid or partly paid — with one-tap collect. */}
      {showDues && (
        <div className="bg-white border border-rose-200 rounded-2xl shadow-sm mb-6 overflow-x-auto" data-reveal>
          <div className="flex items-center justify-between px-4 py-3 border-b border-rose-100">
            <h3 className="font-semibold text-slate-900">Pending payments</h3>
            <button onClick={() => setShowDues(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          {dues.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">No pending payments — every package is fully paid.</p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Patient</th>
                  <th className="px-4 py-2.5 font-medium">Package</th>
                  <th className="px-4 py-2.5 font-medium">Fee</th>
                  <th className="px-4 py-2.5 font-medium">Paid</th>
                  <th className="px-4 py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dues.map((d) => (
                  <tr key={d.id} className="hover:bg-rose-50/40">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900">{d.patientName || '—'}</p>
                      <p className="text-xs text-slate-400">
                        {d.patientCode}
                        {d.patientMobile ? ` · ${d.patientMobile}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-slate-700">{d.name}</p>
                      <p className="text-xs text-slate-400">
                        {formatDay(d.startDay)} – {formatDay(d.endDay)}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatMoney(d.amount)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {formatMoney(d.amountPaid)}
                      <span
                        className={`ml-2 inline-block px-1.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${
                          d.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {d.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-rose-700 whitespace-nowrap">{formatMoney(d.amountDue)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => collect(d)}
                        className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                      >
                        <IndianRupee className="w-3.5 h-3.5" /> Collect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by patient, ID, doctor, service, amount, method…"
            className="w-full pl-9 pr-9 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {q && (
          <span className="text-xs text-slate-400">
            {payments.length} of {allPayments.length} payments
          </span>
        )}
      </div>

      <BulkBar
        count={sel.count}
        onClear={sel.clear}
        onDelete={bulkDelete}
        deleting={bulkDeleting}
        variant="light"
        deleteLabel="Delete selected"
      />

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : allPayments.length > 0 && payments.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No payments match “{q}”.</div>
        ) : payments.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-slate-400">No payments recorded yet.</p>
            <button
              onClick={() => navigate('/reception/billing')}
              className="mt-3 inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 text-sm font-semibold"
            >
              <Plus className="w-4 h-4" /> Record the first payment
            </button>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 w-10">
                  <SelectCheckbox
                    checked={sel.allSelected}
                    indeterminate={sel.someSelected}
                    onChange={sel.toggleAll}
                    ariaLabel="Select all payments"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Assigned doctor</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className={`transition-colors ${sel.isSelected(p.id) ? 'bg-emerald-50' : 'hover:bg-emerald-50/60'}`}
                >
                  <td className="px-4 py-3">
                    <SelectCheckbox
                      checked={sel.isSelected(p.id)}
                      onChange={() => sel.toggle(p.id)}
                      ariaLabel={`Select payment for ${p.patientName || 'patient'}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.createdAt, true)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.patientName || '—'}</p>
                    {p.patientCode && <p className="text-xs text-gray-400">{p.patientCode}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.doctorName ? `Dr. ${p.doctorName}` : <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-4 py-3">
                    {p.plan ? <p className="text-slate-700">{p.plan}</p> : <span className="text-slate-400">—</span>}
                    {p.notes && <p className="text-xs text-slate-400">{p.notes}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{p.method}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(p)}
                        title="Edit payment"
                        className="p-1.5 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeOne(p)}
                        disabled={deletingId === p.id}
                        title="Delete payment"
                        className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditPaymentModal
          payment={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const METHODS: { value: ManualPaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
];

// Edit an existing bill — fix amount / method / service / notes. Amount is shown
// and entered in rupees (stored as paise on the server).
function EditPaymentModal({
  payment,
  onClose,
  onSaved,
}: {
  payment: Payment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount / 100));
  const [method, setMethod] = useState<ManualPaymentMethod>(
    (['cash', 'card', 'upi'].includes(payment.method) ? payment.method : 'cash') as ManualPaymentMethod
  );
  const [plan, setPlan] = useState(payment.plan || '');
  const [notes, setNotes] = useState(payment.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    if (!(Number(amount) > 0)) return setError('Enter a valid amount greater than 0.');
    setSaving(true);
    try {
      await updatePayment(payment.id, { amount: Number(amount), method, plan: plan.trim(), notes: notes.trim() });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes');
      setSaving(false);
    }
  };

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 hm-page-enter my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Pencil className="w-5 h-5 text-emerald-600" /> Edit payment
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-500">{payment.patientName || 'Patient'}{payment.patientCode ? ` · ${payment.patientCode}` : ''}</p>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Amount (₹)</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Method</label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                    method === m.value ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Service / for</label>
            <input
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              placeholder="e.g. Physiotherapy session"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  rose: 'bg-rose-50 text-rose-700',
};

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-3 ${TONES[tone]}`}>{icon}</div>
      <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
