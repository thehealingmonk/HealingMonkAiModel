import { Appointment, AppointmentStatus, listAppointments } from '@/services/api';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-sky-100 text-sky-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-200 text-slate-600',
  no_show: 'bg-red-100 text-red-700',
};

const name = (v: Appointment['patient'] | Appointment['doctor']) =>
  v && typeof v === 'object' ? v.name : '—';

export default function AppointmentsList() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() =>
    listAppointments({ scope: 'all' })
  );
  const appts = data?.appointments ?? [];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Appointments</h2>
          <p className="text-slate-500 text-sm">All bookings across doctors and reception.</p>
        </div>
        <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : appts.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No appointments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appts.map((a) => (
                <tr key={a.id} className="hover:bg-emerald-50/60 transition-colors">
                  <td className="px-4 py-3 text-slate-900">{formatDate(a.scheduledAt, true)}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{name(a.patient)}</td>
                  <td className="px-4 py-3 text-slate-600">{name(a.doctor)}</td>
                  <td className="px-4 py-3 text-slate-600">{a.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[a.status]}`}>
                      {a.status.replace('_', ' ')}
                    </span>
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
