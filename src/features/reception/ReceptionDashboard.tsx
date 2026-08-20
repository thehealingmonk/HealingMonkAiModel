import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarPlus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  UserX,
  Stethoscope,
  Phone,
  IndianRupee,
  CalendarDays,
} from 'lucide-react';
import TableSkeleton from '@/components/ui/TableSkeleton';
import {
  Appointment,
  AppointmentStatus,
  Patient,
  listAppointments,
  setAppointmentStatus,
} from '@/services/api';

interface Props {
  onBook: () => void;
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  cancelled: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
  no_show: 'bg-white/10 text-slate-300',
};

// Today's date in the clinic timezone (IST), as YYYY-MM-DD. Using the browser's
// UTC date (toISOString) would roll over at the wrong moment for early-morning
// hours and hide "today's" bookings, so we format in Asia/Kolkata explicitly.
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// The clinic-local (IST) calendar day of an appointment, as YYYY-MM-DD, so
// bookings group under the correct day regardless of the viewer's timezone.
function istDayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

function prettyDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Friendly relative label for a day header (Today / Tomorrow / weekday date).
function dayLabel(day: string): string {
  const today = istToday();
  if (day === today) return 'Today';
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date(Date.now() + 24 * 60 * 60 * 1000)
  );
  if (day === tomorrow) return 'Tomorrow';
  return prettyDay(day);
}

function name(ref: Appointment['patient']) {
  return ref && typeof ref === 'object' ? ref.name : '—';
}

// The doctor to display for a booking: the one picked at booking time, falling
// back to the patient's currently-assigned doctor when none was chosen.
function doctorOf(a: Appointment): string | null {
  if (a.doctor && typeof a.doctor === 'object') return a.doctor.name;
  return a.assignedDoctorName ?? null;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Build the minimal patient shape the billing page needs from an appointment row.
function patientFromAppt(a: Appointment): Patient | null {
  if (!a.patient || typeof a.patient !== 'object') return null;
  return {
    id: a.patient.id,
    name: a.patient.name,
    patientId: a.patientCode || '',
    mobile: a.patientMobile || '',
  } as Patient;
}

// Reception home: the full schedule grouped by day so every booking — which
// patient, with which doctor, on which day and at what time — is visible at a
// glance, with quick status changes and a per-patient "collect payment" shortcut.
export default function ReceptionDashboard({ onBook }: Props) {
  const navigate = useNavigate();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Upcoming (today onward) by default; toggle to also show past days.
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // No date filter — fetch the whole schedule and group it client-side.
      const { appointments } = await listAppointments({});
      setAppts(appointments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load appointments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Keep the schedule fresh so new bookings/payments show without a manual reload.
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const changeStatus = async (id: string, status: AppointmentStatus) => {
    // Optimistic update.
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await setAppointmentStatus(id, status);
    } catch {
      load(); // revert by reloading on failure
    }
  };

  const goBill = (a: Appointment) => {
    const patient = patientFromAppt(a);
    navigate('/reception/billing', patient ? { state: { patient } } : undefined);
  };

  // Group appointments by their IST day (the API already sorts them by time), so
  // each day renders as its own section in chronological order.
  const groups = useMemo(() => {
    const today = istToday();
    const map = new Map<string, Appointment[]>();
    for (const a of appts) {
      const day = istDayOf(a.scheduledAt);
      if (!showPast && day < today) continue;
      const bucket = map.get(day);
      if (bucket) bucket.push(a);
      else map.set(day, [a]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [appts, showPast]);

  const shownCount = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="hm-page-enter max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Schedule</h2>
          <p className="text-slate-400 text-sm">Book and manage patient appointments.</p>
        </div>
        <button
          onClick={onBook}
          className="hm-lift inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-emerald-500/30"
        >
          <CalendarPlus className="w-4 h-4" /> Book appointment
        </button>
      </div>

      {/* Filter + refresh */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex items-center rounded-lg border border-white/15 bg-white/5 overflow-hidden text-sm">
          <button
            onClick={() => setShowPast(false)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              !showPast ? 'bg-emerald-500/20 text-emerald-200' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setShowPast(true)}
            className={`px-3 py-1.5 font-medium transition-colors border-l border-white/15 ${
              showPast ? 'bg-emerald-500/20 text-emerald-200' : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            All dates
          </button>
        </div>
        <span className="text-xs text-slate-400">
          {loading ? 'Loading…' : `${shownCount} appointment${shownCount === 1 ? '' : 's'}`}
        </span>
        <button
          onClick={load}
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-dark rounded-2xl">
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-dark rounded-2xl px-4 py-12 text-center">
          <Clock className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          <p className="text-sm text-slate-400">
            No {showPast ? '' : 'upcoming '}appointments.
          </p>
          <button
            onClick={onBook}
            className="mt-3 inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 text-sm font-semibold"
          >
            <CalendarPlus className="w-4 h-4" /> Book an appointment
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, list]) => (
            <section key={day}>
              {/* Day header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <CalendarDays className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">{dayLabel(day)}</h3>
                <span className="text-xs text-slate-500">{prettyDay(day)}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {list.length} appointment{list.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="glass-dark rounded-2xl divide-y divide-white/10">
                {list.map((a) => {
                  const doctor = doctorOf(a);
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-2 text-white font-semibold w-20">
                        <Clock className="w-4 h-4 text-slate-400" />
                        {timeOf(a.scheduledAt)}
                      </div>
                      <div className="flex-1 min-w-[10rem]">
                        <p className="font-medium text-white">
                          {name(a.patient)}
                          {a.patientCode && <span className="ml-2 font-mono text-[11px] text-slate-400">{a.patientCode}</span>}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <Stethoscope className="w-3.5 h-3.5 text-emerald-400" />
                            {doctor ? (
                              <span className="font-medium text-emerald-300">Dr. {doctor}</span>
                            ) : (
                              <span className="text-amber-300">Unassigned</span>
                            )}
                          </span>
                          {a.patientMobile && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-400" /> {a.patientMobile}
                            </span>
                          )}
                          {a.reason && <span className="text-slate-400">· {a.reason}</span>}
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[a.status]}`}>
                        {a.status.replace('_', ' ')}
                      </span>
                      <div className="flex items-center gap-1">
                        <IconBtn title="Collect payment" onClick={() => goBill(a)} className="text-emerald-300 hover:bg-white/10">
                          <IndianRupee className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn title="Mark completed" onClick={() => changeStatus(a.id, 'completed')} className="text-emerald-300 hover:bg-white/10">
                          <CheckCircle2 className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn title="No show" onClick={() => changeStatus(a.id, 'no_show')} className="text-slate-300 hover:bg-white/10">
                          <UserX className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn title="Cancel" onClick={() => changeStatus(a.id, 'cancelled')} className="text-rose-300 hover:bg-white/10">
                          <XCircle className="w-4 h-4" />
                        </IconBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button type="button" title={title} onClick={onClick} className={`p-1.5 rounded-md transition-colors ${className}`}>
      {children}
    </button>
  );
}
