import { useCallback, useEffect, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
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

// Shift a YYYY-MM-DD string by n days (calendar-safe, timezone-agnostic).
function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat('en-CA').format(d);
}

function prettyDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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

// Reception home: the day's schedule with quick status changes, a per-patient
// "collect payment" shortcut, and easy day-to-day navigation.
export default function ReceptionDashboard({ onBook }: Props) {
  const navigate = useNavigate();
  const [date, setDate] = useState(istToday);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { appointments } = await listAppointments({ date });
      setAppts(appointments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load appointments');
    } finally {
      setLoading(false);
    }
  }, [date]);

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

  const isToday = date === istToday();

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

      {/* Day navigation */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex items-center rounded-lg border border-white/15 bg-white/5 overflow-hidden">
          <button
            onClick={() => setDate((d) => shiftDay(d, -1))}
            className="p-2 text-slate-300 hover:bg-white/10"
            title="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || istToday())}
            className="px-2 py-1.5 text-sm bg-transparent text-white border-x border-white/15 focus:outline-none [color-scheme:dark]"
          />
          <button
            onClick={() => setDate((d) => shiftDay(d, 1))}
            className="p-2 text-slate-300 hover:bg-white/10"
            title="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {!isToday && (
          <button
            onClick={() => setDate(istToday())}
            className="text-sm font-medium text-emerald-300 hover:text-emerald-200 px-2 py-1.5"
          >
            Today
          </button>
        )}
        <span className="text-sm text-slate-400">{prettyDay(date)}</span>
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

      <p className="text-xs text-slate-400 mb-2">
        {loading ? 'Loading…' : `${appts.length} appointment${appts.length === 1 ? '' : 's'}`}
      </p>

      <div className="glass-dark rounded-2xl divide-y divide-white/10">
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : appts.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Clock className="w-8 h-8 mx-auto mb-2 text-slate-500" />
            <p className="text-sm text-slate-400">No appointments for {isToday ? 'today' : 'this day'}.</p>
            <button
              onClick={onBook}
              className="mt-3 inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 text-sm font-semibold"
            >
              <CalendarPlus className="w-4 h-4" /> Book an appointment
            </button>
          </div>
        ) : (
          appts.map((a) => {
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
          })
        )}
      </div>
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
