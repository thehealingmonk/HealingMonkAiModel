import { Payment, PaymentStatus, listPayments } from '@/services/api';
import { formatDate, formatMoney } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';

const STATUS_BADGE: Record<PaymentStatus, string> = {
  paid: 'bg-emerald-100 text-emerald-700',
  created: 'bg-sky-100 text-sky-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-amber-100 text-amber-700',
};

export default function PaymentsList() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() => listPayments());
  const payments = data?.payments ?? [];

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Payments</h2>
          <p className="text-slate-500 text-sm">
            Cash and online collections · <span className="font-semibold text-slate-900">{formatMoney(totalPaid)}</span> collected
          </p>
        </div>
        <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No payments recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reference</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-emerald-50/60 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{p.method}</td>
                  <td className="px-4 py-3 text-slate-600">{p.plan || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.razorpayPaymentId || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(p.createdAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
