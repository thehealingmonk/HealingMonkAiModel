import { Payment, PaymentStatus, listPayments } from '@/services/api';
import { formatDate, formatMoney } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
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
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() => listPayments());
  const payments = data?.payments ?? [];

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

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

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No payments recorded yet.</div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Collected by</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-white/5 transition-colors">
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
