import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  Stethoscope,
  Phone,
  Users,
} from 'lucide-react';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { Appointment, AppointmentStatus, listAppointments } from '@/services/api';

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20',
  completed: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  cancelled: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
  no_show: 'bg-white/10 text-slate-300',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Today's IST calendar day as YYYY-MM-DD (matches the schedule page's timezone
// handling so counts line up with what reception sees elsewhere).
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// The clinic-local (IST) day of an appointment, as YYYY-MM-DD.
function istDayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso));
}

// YYYY-MM-DD for a given year/month(0-based)/day, without timezone drift.
function ymd(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function prettyDay(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function name(ref: Appointment['patient']) {
  return ref && typeof ref === 'object' ? ref.name : '—';
}

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

// Reception calendar: a month grid where every day shows how many patients had
// appointments that date. Click a day to filter the list to just that date, so
// reception can answer "how many / which patients came on <date>" at a glance.
export default function ReceptionCalendar() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The month currently displayed (first day of that month, in local time).
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  // The day selected for the detail list below the grid (YYYY-MM-DD).
  const [selected, setSelected] = useState<string>(() => istToday());

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch the whole schedule once; all counting/filtering is done client-side.
      const { appointments } = await listAppointments({ scope: 'all' });
      setAppts(appointments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load appointments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // day (YYYY-MM-DD) -> appointment count, computed once per data change.
  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appts) {
      const day = istDayOf(a.scheduledAt);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [appts]);

  // The appointments on the selected day, sorted by time.
  const selectedAppts = useMemo(
    () =>
      appts
        .filter((a) => istDayOf(a.scheduledAt) === selected)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [appts, selected]
  );

  // Build the calendar grid: a flat list of cells, padded with nulls for the
  // leading blanks before the 1st so the first day lands under its weekday.
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [year, month]);

  // Total appointments across the visible month (for the header summary).
  const monthTotal = useMemo(() => {
    let n = 0;
    for (const [day, c] of countByDay) {
      if (day.startsWith(ymd(year, month, 1).slice(0, 7))) n += c;
    }
    return n;
  }, [countByDay, year, month]);

  const today = istToday();
  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goThisMonth = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(istToday());
  };

  return (
    <div className="hm-page-enter max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Calendar</h2>
          <p className="text-slate-400 text-sm">See how many patients came on each date.</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-white font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={goPrev}
          className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-white min-w-[10rem] text-center">{monthLabel}</h3>
        <button
          onClick={goNext}
          className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={goThisMonth}
          className="ml-2 text-xs font-medium text-emerald-300 hover:text-emerald-200 border border-emerald-400/30 rounded-md px-2 py-1"
        >
          Today
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400">
          <Users className="w-4 h-4 text-emerald-400" />
          {loading ? 'Loading…' : `${monthTotal} this month`}
        </span>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="glass-dark rounded-2xl">
          <TableSkeleton rows={6} cols={7} />
        </div>
      ) : (
        <div className="glass-dark rounded-2xl p-3 sm:p-4">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} />;
              const day = ymd(year, month, d);
              const count = countByDay.get(day) ?? 0;
              const isToday = day === today;
              const isSelected = day === selected;
              return (
                <button
                  key={day}
                  onClick={() => setSelected(day)}
                  className={`relative flex flex-col items-center justify-center aspect-square rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/25 ring-1 ring-emerald-400/50 text-white'
                      : count > 0
                        ? 'bg-white/5 hover:bg-white/10 text-white'
                        : 'text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span className={`${isToday ? 'font-bold text-emerald-300' : ''}`}>{d}</span>
                  {count > 0 && (
                    <span className="mt-0.5 inline-flex items-center justify-center min-w-[1.25rem] px-1 h-4 rounded-full bg-emerald-500/30 text-emerald-200 text-[10px] font-semibold leading-none">
                      {count}
                    </span>
                  )}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected day detail */}
      {!loading && (
        <section className="mt-6">
          <div className="flex items-center gap-2 mb-2 px-1">
            <CalendarDays className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">{prettyDay(selected)}</h3>
            <span className="ml-auto text-xs text-slate-400">
              {selectedAppts.length} patient{selectedAppts.length === 1 ? '' : 's'}
            </span>
          </div>

          {selectedAppts.length === 0 ? (
            <div className="glass-dark rounded-2xl px-4 py-10 text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-500" />
              <p className="text-sm text-slate-400">No appointments on this date.</p>
            </div>
          ) : (
            <div className="glass-dark rounded-2xl divide-y divide-white/10">
              {selectedAppts.map((a) => {
                const doctor = doctorOf(a);
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-2 text-white font-semibold w-20">
                      <Clock className="w-4 h-4 text-slate-400" />
                      {timeOf(a.scheduledAt)}
                    </div>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="font-medium text-white">
                        {name(a.patient)}
                        {a.patientCode && (
                          <span className="ml-2 font-mono text-[11px] text-slate-400">{a.patientCode}</span>
                        )}
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
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
