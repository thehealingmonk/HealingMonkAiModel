import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Copy, Globe, Loader2, Video } from 'lucide-react';
import {
  Appointment,
  AppointmentStatus,
  AuthUser,
  assignAppointmentDoctor,
  listAppointments,
  listDoctors,
  setAppointmentStatus,
  startAppointmentMeeting,
} from '@/services/api';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import { useRowSelection } from '@/hooks/useRowSelection';
import { BulkBar, SelectCheckbox } from '@/components/ui/BulkBar';
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
type SourceFilter = 'all' | 'online' | 'new';

/** A website booking still waiting for a doctor — the "new lead" inbox. */
const isNewLead = (a: Appointment) => a.source === 'online' && a.status === 'scheduled' && !a.doctor;
/** Meeting statuses that still have a usable room. */
const LIVE_MEETING = ['created', 'waiting', 'active', 'ai_active'];

export default function AppointmentsList() {
  const { data, loading, refreshing, error: loadError, lastUpdated, refresh } = useLiveData(() =>
    listAppointments({ scope: 'all' })
  );
  const allAppts = data?.appointments ?? [];

  const [q, setQ] = useState('');
  const [range, setRange] = useState<DateRange>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [doctors, setDoctors] = useState<AuthUser[]>([]);
  // Row-level busy flags ("assign:<id>", "meet:<id>") and a short success note.
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    listDoctors()
      .then((r) => setDoctors(r.users.filter((d) => d.active !== false)))
      .catch(() => setDoctors([]));
  }, []);
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [actionError, setActionError] = useState('');
  const error = actionError || loadError;

  // Counts over the full dataset so the pills/strip stay stable while filtering.
  const counts = useMemo(() => {
    const by: Record<AppointmentStatus, number> = { scheduled: 0, completed: 0, cancelled: 0, no_show: 0 };
    let today = 0;
    let online = 0;
    let newLeads = 0;
    for (const a of allAppts) {
      by[a.status]++;
      if (isToday(a.scheduledAt)) today++;
      if (a.source === 'online') online++;
      if (isNewLead(a)) newLeads++;
    }
    return { total: allAppts.length, today, online, newLeads, ...by };
  }, [allAppts]);

  const appts = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allAppts
      .filter((a) => {
        if (status !== 'all' && a.status !== status) return false;
        if (source === 'online' && a.source !== 'online') return false;
        if (source === 'new' && !isNewLead(a)) return false;
        if (!inRange(a.scheduledAt, range)) return false;
        if (term) {
          const hay = `${name(a.patient)} ${name(a.doctor)} ${a.reason || ''} ${a.patientCode || ''} ${a.patientMobile || ''}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((x, y) => new Date(y.scheduledAt).getTime() - new Date(x.scheduledAt).getTime());
  }, [allAppts, q, range, status, source]);

  const sel = useRowSelection(appts.map((a) => a.id));

  // Bulk "cancel selected" — appointments aren't deleted, they're cancelled
  // (keeps history). Skips any already-cancelled rows.
  const bulkCancel = async () => {
    const ids = appts.filter((a) => sel.isSelected(a.id) && a.status !== 'cancelled').map((a) => a.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Cancel ${ids.length} selected appointment${ids.length > 1 ? 's' : ''}?`)) return;
    setActionError('');
    setBulkCancelling(true);
    try {
      for (const id of ids) await setAppointmentStatus(id, 'cancelled');
      sel.clear();
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not cancel selected appointments');
    } finally {
      setBulkCancelling(false);
    }
  };

  // Route a booking to a doctor.
  const assign = async (a: Appointment, doctorId: string) => {
    setActionError('');
    setNotice('');
    setBusy(`assign:${a.id}`);
    try {
      await assignAppointmentDoctor(a.id, doctorId || null);
      const doc = doctors.find((d) => d.id === doctorId);
      setNotice(doc ? `Assigned ${name(a.patient)} to Dr. ${doc.name}.` : `Doctor removed from ${name(a.patient)}'s booking.`);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not assign doctor');
    } finally {
      setBusy(null);
    }
  };

  // Create (or reuse) the video meeting for a booking; the patient is emailed the link.
  const startMeeting = async (a: Appointment) => {
    setActionError('');
    setNotice('');
    setBusy(`meet:${a.id}`);
    try {
      const { meeting, reused } = await startAppointmentMeeting(a.id);
      const link = `${window.location.origin}/m/${meeting.roomToken}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        /* clipboard may be blocked — the link is still shown in Meetings */
      }
      setNotice(
        reused
          ? `Meeting already exists for ${name(a.patient)} — link copied.`
          : `Meeting created for ${name(a.patient)}. Invite emailed${meeting.inviteSentAt ? '' : ' (no email on file — share the copied link)'}; link copied.`
      );
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not create meeting');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/m/${token}`);
      setNotice('Meeting link copied.');
    } catch {
      setActionError('Could not copy — open Meetings to share the link.');
    }
  };

  const exportColumns = [
    { header: 'When', value: (a: Appointment) => formatDate(a.scheduledAt, true) },
    { header: 'Patient', value: (a: Appointment) => name(a.patient) },
    { header: 'Doctor', value: (a: Appointment) => name(a.doctor) },
    { header: 'Reason', value: (a: Appointment) => a.reason || '' },
    { header: 'Status', value: (a: Appointment) => a.status.replace('_', ' ') },
    { header: 'Source', value: (a: Appointment) => (a.source === 'online' ? 'Website' : 'Clinic') },
    { header: 'Visit', value: (a: Appointment) => (a.mode === 'video' ? 'Video' : 'In-clinic') },
    { header: 'Mobile', value: (a: Appointment) => a.patientMobile || '' },
  ];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Appointments</h2>
          <p className="text-slate-400 text-sm">All bookings — clinic and website. Assign a doctor and start video meetings here.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton filename="appointments" columns={exportColumns} rows={appts} />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}
      {notice && !error && (
        <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300" role="status">
          {notice}
        </div>
      )}

      {counts.newLeads > 0 && source !== 'new' && (
        <button
          type="button"
          onClick={() => setSource('new')}
          className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-left text-sm"
          data-reveal="fade"
        >
          <span className="flex items-center gap-2 font-semibold text-amber-300">
            <Globe className="h-4 w-4" /> {counts.newLeads} new website booking{counts.newLeads > 1 ? 's' : ''} waiting for a doctor
          </span>
          <span className="font-semibold text-amber-300">Review →</span>
        </button>
      )}

      <StatStrip
        items={[
          { label: 'Total', value: counts.total },
          { label: 'Today', value: counts.today, tint: 'text-emerald-300' },
          { label: 'Website', value: counts.online, tint: 'text-amber-300' },
          { label: 'Scheduled', value: counts.scheduled, tint: 'text-sky-300' },
          { label: 'Completed', value: counts.completed, tint: 'text-emerald-300' },
          { label: 'No-show', value: counts.no_show, tint: 'text-rose-300' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3" data-reveal="fade">
        <SearchBox value={q} onChange={setQ} placeholder="Search patient / doctor / reason" />
        <SegmentedFilter
          value={source}
          onChange={setSource}
          ariaLabel="Booking source"
          options={[
            { value: 'all', label: 'All bookings' },
            { value: 'online', label: 'Website', count: counts.online },
            { value: 'new', label: 'New leads', count: counts.newLeads },
          ]}
        />
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

      <BulkBar
        count={sel.count}
        onClear={sel.clear}
        onDelete={bulkCancel}
        deleting={bulkCancelling}
        variant="dark"
        deleteLabel="Cancel selected"
      />

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : appts.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            {allAppts.length === 0 ? 'No appointments yet.' : 'No appointments match these filters.'}
          </div>
        ) : (
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 w-10">
                  <SelectCheckbox
                    checked={sel.allSelected}
                    indeterminate={sel.someSelected}
                    onChange={sel.toggleAll}
                    ariaLabel="Select all appointments"
                  />
                </th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Meeting</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {appts.map((a) => (
                <tr key={a.id} className={`transition-colors ${sel.isSelected(a.id) ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}>
                  <td className="px-4 py-3">
                    <SelectCheckbox
                      checked={sel.isSelected(a.id)}
                      onChange={() => sel.toggle(a.id)}
                      ariaLabel={`Select appointment for ${name(a.patient)}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-white">{formatDate(a.scheduledAt, true)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{name(a.patient)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      {a.patientMobile && <span>{a.patientMobile}</span>}
                      {a.source === 'online' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
                          <Globe className="h-3 w-3" /> Website
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 font-medium text-slate-300">
                        {a.mode === 'video' ? <Video className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                        {a.mode === 'video' ? 'Video' : 'In-clinic'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={a.doctor && typeof a.doctor === 'object' ? a.doctor.id : typeof a.doctor === 'string' ? a.doctor : ''}
                        onChange={(e) => assign(a, e.target.value)}
                        disabled={busy === `assign:${a.id}` || a.status === 'cancelled'}
                        aria-label={`Doctor for ${name(a.patient)}`}
                        className={`max-w-[170px] rounded-lg border px-2 py-1.5 text-sm ${
                          isNewLead(a) ? 'border-amber-400/60 bg-amber-500/10' : 'border-white/15 bg-white/5'
                        }`}
                      >
                        <option value="">{isNewLead(a) ? 'Assign doctor…' : '— None —'}</option>
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>
                            Dr. {d.name}
                          </option>
                        ))}
                      </select>
                      {busy === `assign:${a.id}` && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 max-w-[220px]">
                    <span className="line-clamp-2">{a.reason || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_BADGE[a.status]}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <MeetingCell
                      appt={a}
                      busy={busy === `meet:${a.id}`}
                      onStart={() => startMeeting(a)}
                      onJoin={(token) => navigate(`/m/${token}?host=1`)}
                      onCopy={copyLink}
                    />
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

/** Meeting action for one booking: start the video meeting, then join / copy its link. */
function MeetingCell({
  appt,
  busy,
  onStart,
  onJoin,
  onCopy,
}: {
  appt: Appointment;
  busy: boolean;
  onStart: () => void;
  onJoin: (token: string) => void;
  onCopy: (token: string) => void;
}) {
  const m = appt.meeting;
  const live = m?.roomToken && LIVE_MEETING.includes(m.status || '');
  if (live && m?.roomToken) {
    const token = m.roomToken;
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onJoin(token)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Video className="h-3.5 w-3.5" /> Join
        </button>
        <button
          type="button"
          onClick={() => onCopy(token)}
          title="Copy patient link"
          aria-label="Copy meeting link"
          className="rounded-lg border border-white/15 p-1.5 text-slate-300 hover:bg-white/10"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  if (m?.status && !live) {
    return <span className="text-xs capitalize text-slate-400">Meeting {m.status.replace('_', ' ')}</span>;
  }
  if (appt.status !== 'scheduled') return <span className="text-xs text-slate-500">—</span>;
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      title={appt.doctor ? 'Create a video room and email the patient' : 'Tip: assign a doctor first so the meeting is bound to them'}
      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60 ${
        appt.mode === 'video'
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm'
          : 'border border-white/15 text-slate-300 hover:bg-white/10'
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
      {appt.mode === 'video' ? 'Start meeting' : 'Online meeting'}
    </button>
  );
}
