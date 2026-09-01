import { useMemo, useState } from 'react';
import { Appointment, AppointmentStatus, listAppointments } from '@/services/api';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';
import {
  StatStrip,
  SegmentedFilter,
  SearchBox,
  DateRange,
  DATE_RANGE_OPTIONS,
  inRange,
  isToday,
} from '@/components/ui/ListControls';

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  cancelled: 'bg-white/10 text-slate-300',
  no_show: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
};

const name = (v: Appointment['patient'] | Appointment['doctor']) =>
  v && typeof v === 'object' ? v.name : '—';

type StatusFilter = 'all' | AppointmentStatus;

export default function AppointmentsList() {
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() =>
    listAppointments({ scope: 'all' })
  );
  const allAppts = data?.appointments ?? [];

  const [q, setQ] = useState('');
  const [range, setRange] = useState<DateRange>('all');
  const [status, setStatus] = useState<StatusFilter>('all');

  // Counts over the full dataset so the pills/strip stay stable while filtering.
  const counts = useMemo(() => {
    const by: Record<AppointmentStatus, number> = { scheduled: 0, completed: 0, cancelled: 0, no_show: 0 };
    let today = 0;
    for (const a of allAppts) {
      by[a.status]++;
      if (isToday(a.scheduledAt)) today++;
    }
    return { total: allAppts.length, today, ...by };
  }, [allAppts]);

  const appts = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allAppts
      .filter((a) => {
        if (status !== 'all' && a.status !== status) return false;
        if (!inRange(a.scheduledAt, range)) return false;
        if (term) {
          const hay = `${name(a.patient)} ${name(a.doctor)} ${a.reason || ''} ${a.patientCode || ''} ${a.patientMobile || ''}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((x, y) => new Date(y.scheduledAt).getTime() - new Date(x.scheduledAt).getTime());
  }, [allAppts, q, range, status]);

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

      <StatStrip
        items={[
          { label: 'Total', value: counts.total },
          { label: 'Today', value: counts.today, tint: 'text-emerald-300' },
          { label: 'Scheduled', value: counts.scheduled, tint: 'text-sky-300' },
          { label: 'Completed', value: counts.completed, tint: 'text-emerald-300' },
          { label: 'No-show', value: counts.no_show, tint: 'text-rose-300' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3" data-reveal="fade">
        <SearchBox value={q} onChange={setQ} placeholder="Search patient / doctor / reason" />
        <SegmentedFilter value={range} options={DATE_RANGE_OPTIONS} onChange={setRange} ariaLabel="Date range" />
        <SegmentedFilter
          value={status}
          onChange={setStatus}
          ariaLabel="Status filter"
          options={[
            { value: 'all', label: 'All' },
            { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
            { value: 'completed', label: 'Completed', count: counts.completed },
            { value: 'cancelled', label: 'Cancelled', count: counts.cancelled },
            { value: 'no_show', label: 'No-show', count: counts.no_show },
          ]}
        />
      </div>

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : appts.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            {allAppts.length === 0 ? 'No appointments yet.' : 'No appointments match these filters.'}
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
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
