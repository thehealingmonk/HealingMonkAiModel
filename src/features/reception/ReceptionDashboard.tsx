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
  CalendarClock,
  Pencil,
  Paperclip,
  X,
  Loader2,
} from 'lucide-react';
import TableSkeleton from '@/components/ui/TableSkeleton';
import PatientEditModal from '@/components/common/PatientEditModal';
import PatientDocuments from '@/components/common/PatientDocuments';
import {
  Appointment,
  AppointmentStatus,
  Patient,
  listAppointments,
  setAppointmentStatus,
  rescheduleAppointment,
  getPatient,
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
  // Row actions: reschedule an appointment, edit a patient, manage documents.
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(null);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [docsFor, setDocsFor] = useState<{ id: string; name: string } | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

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

  // Open the edit modal for an appointment's patient. The schedule row only
  // carries a light patient ref, so fetch the full record first.
  const openEdit = async (a: Appointment) => {
    if (!a.patient || typeof a.patient !== 'object') return;
    setLoadingEditId(a.id);
    try {
      const { patient } = await getPatient(a.patient.id);
      setEditPatient(patient);
    } catch {
      /* ignore — button simply does nothing on failure */
    } finally {
      setLoadingEditId(null);
    }
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
                        <IconBtn title="Reschedule" onClick={() => setRescheduleAppt(a)} className="text-sky-300 hover:bg-white/10">
                          <CalendarClock className="w-4 h-4" />
                        </IconBtn>
                        <IconBtn
                          title="Edit patient"
                          onClick={() => openEdit(a)}
                          className="text-slate-300 hover:bg-white/10"
                        >
                          {loadingEditId === a.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Pencil className="w-4 h-4" />
                          )}
                        </IconBtn>
                        <IconBtn
                          title="Documents"
                          onClick={() => a.patient && typeof a.patient === 'object' && setDocsFor({ id: a.patient.id, name: a.patient.name })}
                          className="text-slate-300 hover:bg-white/10"
                        >
                          <Paperclip className="w-4 h-4" />
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

      {rescheduleAppt && (
        <RescheduleModal
          appointment={rescheduleAppt}
          onClose={() => setRescheduleAppt(null)}
          onDone={() => {
            setRescheduleAppt(null);
            load();
          }}
        />
      )}

      {editPatient && (
        <PatientEditModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={() => {
            setEditPatient(null);
            load();
          }}
        />
      )}

      {docsFor && (
        <DocumentsModal patient={docsFor} onClose={() => setDocsFor(null)} />
      )}
    </div>
  );
}

// Pick a new date & time for an appointment. Reuses the existing reschedule API
// (which also emails the patient the new time).
function RescheduleModal({
  appointment,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
}) {
  // Pre-fill the picker with the current slot in the browser's local time.
  const initial = (() => {
    const d = new Date(appointment.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const [when, setWhen] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    const dt = new Date(when);
    if (Number.isNaN(dt.getTime())) return setError('Pick a valid date & time.');
    setSaving(true);
    try {
      await rescheduleAppointment(appointment.id, dt.toISOString());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reschedule');
      setSaving(false);
    }
  };

  const patientName = appointment.patient && typeof appointment.patient === 'object' ? appointment.patient.name : 'patient';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 hm-page-enter">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-sky-600" /> Reschedule
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600">
            New date & time for <b>{patientName}</b>. The patient is emailed the change.
          </p>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Reschedule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Manage a patient's documents from the reception schedule.
function DocumentsModal({
  patient,
  onClose,
}: {
  patient: { id: string; name: string };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-4 sm:py-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 hm-page-enter">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Paperclip className="w-5 h-5 text-emerald-600" /> Documents
            <span className="text-sm font-normal text-slate-400">· {patient.name}</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <PatientDocuments patientId={patient.id} />
        </div>
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
