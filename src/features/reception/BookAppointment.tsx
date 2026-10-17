import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, Search, UserPlus, CalendarPlus } from 'lucide-react';
import {
  AppointmentStatus,
  AuthUser,
  Patient,
  listPatients,
  listDoctors,
  createPatient,
  bookAppointment,
} from '@/services/api';

interface Props {
  onBack: () => void;
  onBooked: () => void;
}

// Today in the clinic timezone (IST) as YYYY-MM-DD.
function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

// Reception booking flow: pick (or quick-add) a patient, choose a doctor and a
// date/time, then create the appointment. The patient confirmation email is
// sent by the API. Past dates are allowed so old visits can be entered: those
// are saved as completed (or no-show) and no email goes out.
// ?date=YYYY-MM-DD preselects the date (used by the calendar's "Add visit").
export default function BookAppointment({ onBack, onBooked }: Props) {
  const [doctors, setDoctors] = useState<AuthUser[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Patient | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  // New-patient quick fields.
  const [np, setNp] = useState({ name: '', mobile: '', email: '', complaint: '' });

  // Appointment fields.
  const [doctorId, setDoctorId] = useState('');
  const [search] = useSearchParams();
  const [date, setDate] = useState(() => {
    const q = search.get('date');
    return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : istToday();
  });
  const [time, setTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [pastStatus, setPastStatus] = useState<AppointmentStatus>('completed');
  const isPast = date < istToday();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listDoctors()
      .then((r) => setDoctors(r.users))
      .catch(() => setDoctors([]));
  }, []);

  // Debounced patient search.
  useEffect(() => {
    if (addingNew) return;
    let cancelled = false;
    const t = setTimeout(() => {
      listPatients({ q: query, scope: 'all' })
        .then((r) => !cancelled && setPatients(r.patients))
        .catch(() => !cancelled && setPatients([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, addingNew]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const scheduledAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError('Please choose a valid date and time.');
      return;
    }

    setSaving(true);
    try {
      let patientId = selected?.id;

      if (addingNew) {
        if (!np.name.trim()) throw new Error('Patient name is required.');
        const { patient } = await createPatient({
          name: np.name.trim(),
          mobile: np.mobile.trim(),
          email: np.email.trim(),
          complaint: np.complaint.trim(),
          assignedDoctor: doctorId || null,
        });
        patientId = patient.id;
      }

      if (!patientId) throw new Error('Select a patient or add a new one.');

      await bookAppointment({
        patientId,
        doctorId: doctorId || null,
        scheduledAt: scheduledAt.toISOString(),
        reason: reason.trim(),
        ...(isPast ? { status: pastStatus } : {}),
      });
      onBooked();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not book appointment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back to schedule
      </button>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <CalendarPlus className="w-5 h-5 text-green-600" /> Book appointment
        </h2>

        <form onSubmit={submit} className="space-y-6">
          {/* Patient selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Patient</label>
              <button
                type="button"
                onClick={() => {
                  setAddingNew(!addingNew);
                  setSelected(null);
                }}
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 font-medium"
              >
                <UserPlus className="w-4 h-4" />
                {addingNew ? 'Pick existing' : 'New patient'}
              </button>
            </div>

            {addingNew ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className={inputCls}
                  placeholder="Full name *"
                  value={np.name}
                  onChange={(e) => setNp({ ...np, name: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="Mobile"
                  value={np.mobile}
                  onChange={(e) => setNp({ ...np, mobile: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="Email"
                  value={np.email}
                  onChange={(e) => setNp({ ...np, email: e.target.value })}
                />
                <input
                  className={inputCls}
                  placeholder="Complaint"
                  value={np.complaint}
                  onChange={(e) => setNp({ ...np, complaint: e.target.value })}
                />
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    className={`${inputCls} pl-9`}
                    placeholder="Search by name…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-44 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {patients.length === 0 && (
                    <p className="text-sm text-gray-400 px-3 py-4 text-center">No patients found.</p>
                  )}
                  {patients.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-50 ${
                        selected?.id === p.id ? 'bg-green-50' : ''
                      }`}
                    >
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.patientId || p.mobile}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Doctor</label>
            <select
              className={inputCls}
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date / time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
              <input
                type="time"
                className={inputCls}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          {isPast && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
              <p className="text-sm text-amber-800 mb-2">
                Past date — this will be saved as an old visit (no email is sent to the patient).
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-gray-700">
                {(['completed', 'no_show'] as AppointmentStatus[]).map((s) => (
                  <label key={s} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="pastStatus"
                      checked={pastStatus === s}
                      onChange={() => setPastStatus(s)}
                    />
                    {s === 'completed' ? 'Patient came (completed)' : 'Did not come (no-show)'}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Reason (optional)</label>
            <input
              className={inputCls}
              placeholder="e.g. Lower back pain follow-up"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : isPast ? 'Save old visit' : 'Confirm booking'}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm';
