import { IndianRupee, Wallet, CreditCard, Receipt } from 'lucide-react';
import { PaymentStatus, listPayments } from '@/services/api';
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

// Reception "Collections": all-time money taken at the desk plus who paid, which
// doctor they're assigned to, and who collected it. Totals come from the server
// aggregation (whole collection), so they stay accurate beyond the 300-row list.
export default function ReceptionCollections() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() => listPayments());
  const payments = data?.payments ?? [];
  const summary = data?.summary;

  // Fall back to summing the visible rows if the server summary is missing.
  const totalPaid = summary?.totalPaid ?? payments.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const paidCount = summary?.paidCount ?? payments.filter((p) => p.status === 'paid').length;
  const cashPaid = summary?.cashPaid ?? 0;
  const onlinePaid = summary?.onlinePaid ?? 0;

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Collections</h2>
          <p className="text-slate-500 text-sm">All-time money collected at reception.</p>
        </div>
        <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-reveal>
        <StatCard icon={<IndianRupee className="w-5 h-5" />} label="Total collected" value={formatMoney(totalPaid)} tone="emerald" />
        <StatCard icon={<Receipt className="w-5 h-5" />} label="Payments" value={String(paidCount)} tone="slate" />
        <StatCard icon={<Wallet className="w-5 h-5" />} label="Cash" value={formatMoney(cashPaid)} tone="amber" />
        <StatCard icon={<CreditCard className="w-5 h-5" />} label="Online" value={formatMoney(onlinePaid)} tone="sky" />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : payments.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No payments recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Assigned doctor</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Collected by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-emerald-50/60 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.createdAt, true)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.patientName || '—'}</p>
                    {p.patientCode && <p className="text-xs text-gray-400">{p.patientCode}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.doctorName ? `Dr. ${p.doctorName}` : <span className="text-slate-400">Unassigned</span>}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{p.method}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.collectedByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
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
