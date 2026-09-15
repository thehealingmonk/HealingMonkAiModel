import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { Payment, PaymentStatus, listPayments, deletePayment } from '@/services/api';
import { formatDate, formatMoney } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import { useRowSelection } from '@/hooks/useRowSelection';
import { BulkBar, SelectCheckbox } from '@/components/ui/BulkBar';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';

const STATUS_BADGE: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  created: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  failed: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
  refunded: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20',
};

export default function PaymentsList() {
  const { data, loading, refreshing, error: loadError, lastUpdated, refresh } = useLiveData(() => listPayments());
  const payments = data?.payments ?? [];

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [actionError, setActionError] = useState('');
  const error = actionError || loadError;

  const sel = useRowSelection(payments.map((p) => p.id));

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

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
    { header: 'Amount (INR)', value: (p: Payment) => (p.amount / 100).toFixed(2) },
    { header: 'Method', value: (p: Payment) => p.method },
    { header: 'Plan', value: (p: Payment) => p.plan || '' },
    { header: 'Status', value: (p: Payment) => p.status },
    { header: 'Collected by', value: (p: Payment) => p.collectedByName || '' },
    { header: 'Reference', value: (p: Payment) => p.razorpayPaymentId || '' },
  ];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Payments</h2>
          <p className="text-slate-400 text-sm">
            Cash and online collections · <span className="font-semibold text-white">{formatMoney(totalPaid)}</span> collected
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton filename="payments" columns={exportColumns} rows={payments} />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <BulkBar count={sel.count} onClear={sel.clear} onDelete={bulkDelete} deleting={bulkDeleting} variant="dark" />

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No payments recorded yet.</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 w-10">
                  <SelectCheckbox
                    checked={sel.allSelected}
                    indeterminate={sel.someSelected}
                    onChange={sel.toggleAll}
                    ariaLabel="Select all payments"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Collected by</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {payments.map((p) => (
                <tr key={p.id} className={`transition-colors ${sel.isSelected(p.id) ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}>
                  <td className="px-4 py-3">
                    <SelectCheckbox
                      checked={sel.isSelected(p.id)}
                      onChange={() => sel.toggle(p.id)}
                      ariaLabel={`Select payment for ${p.patientName || 'patient'}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{p.patientName || '—'}</p>
                    {p.patientCode && <p className="text-xs text-slate-400">{p.patientCode}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-slate-300 capitalize">{p.method}</td>
                  <td className="px-4 py-3 text-slate-300">{p.plan || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{p.collectedByName || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{formatDate(p.createdAt, true)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeOne(p)}
                      disabled={deletingId === p.id}
                      title="Delete payment"
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-300 hover:bg-white/10 disabled:opacity-50"
                    >
                      {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
