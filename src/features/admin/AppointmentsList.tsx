import { Appointment, AppointmentStatus, listAppointments } from '@/services/api';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  cancelled: 'bg-white/10 text-slate-300',
  no_show: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
};

const name = (v: Appointment['patient'] | Appointment['doctor']) =>
  v && typeof v === 'object' ? v.name : '—';

export default function AppointmentsList() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() =>
    listAppointments({ scope: 'all' })
  );
  const appts = data?.appointments ?? [];

  const exportColumns = [
    { header: 'When', value: (a: Appointment) => formatDate(a.scheduledAt, true) },
    { header: 'Patient', value: (a: Appointment) => name(a.patient) },
    { header: 'Doctor', value: (a: Appointment) => name(a.doctor) },
    { header: 'Reason', value: (a: Appointment) => a.reason || '' },
    { header: 'Status', value: (a: Appointment) => a.status.replace('_', ' ') },
  ];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Appointments</h2>
          <p className="text-slate-400 text-sm">All bookings across doctors and reception.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton filename="appointments" columns={exportColumns} rows={appts} />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : appts.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No appointments yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {appts.map((a) => (
                <tr key={a.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white">{formatDate(a.scheduledAt, true)}</td>
                  <td className="px-4 py-3 font-medium text-white">{name(a.patient)}</td>
                  <td className="px-4 py-3 text-slate-300">{name(a.doctor)}</td>
                  <td className="px-4 py-3 text-slate-300">{a.reason || '—'}</td>
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
