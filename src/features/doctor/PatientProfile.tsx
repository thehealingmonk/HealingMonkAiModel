import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Activity,
  FileText,
  Stethoscope,
  ExternalLink,
  KeyRound,
  CheckCircle2,
  Copy,
  TrendingUp,
  TrendingDown,
  Minus,
  IndianRupee,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react';
import RecordPaymentModal from '@/features/reception/RecordPaymentModal';
import PatientEditModal from '@/components/common/PatientEditModal';
import PatientDocuments from '@/components/common/PatientDocuments';
import {
  Patient,
  Report,
  Appointment,
  AppointmentStatus,
  Payment,
  PaymentStatus,
  listPatientReports,
  listAppointments,
  listPayments,
  getPatientAccount,
  setPatientAccount,
  deletePatient,
  PatientAccountStatus,
} from '@/services/api';
import { formatDate, formatMoney } from '@/utils/formatter';
import { useAuth } from '@/store/auth.store';

interface Props {
  patient: Patient;
  onBack: () => void;
  onStartAssessment: () => void;
}

const SCORE_COLOR = (score: number | null) =>
  score === null ? 'text-gray-400' : score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-500' : 'text-red-600';

const SCORE_BG = (score: number | null) =>
  score === null ? 'bg-gray-200' : score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-400' : 'bg-red-500';

const APPT_BADGE: Record<AppointmentStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-200 text-gray-600',
  no_show: 'bg-red-100 text-red-700',
};

const PAY_BADGE: Record<PaymentStatus, string> = {
  paid: 'bg-green-100 text-green-700',
  created: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  refunded: 'bg-amber-100 text-amber-700',
};

export default function PatientProfile({ patient, onBack, onStartAssessment }: Props) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  // Local copy so an inline edit reflects immediately without a round-trip up
  // to the routing parent (which also holds the record). Re-synced by id.
  const [current, setCurrent] = useState<Patient>(patient);
  const [reports, setReports] = useState<Report[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState('');

  useEffect(() => setCurrent(patient), [patient]);

  const handleDelete = async () => {
    setDelError('');
    setDeleting(true);
    try {
      await deletePatient(current.id);
      onBack();
    } catch (err) {
      setDelError(err instanceof Error ? err.message : 'Could not delete patient');
      setDeleting(false);
    }
  };

  // Doctors and admins may both view this patient's billing (the payments API
  // allows either role); only admins can record a new one from here.
  const loadPayments = async () => {
    try {
      const { payments } = await listPayments(patient.id);
      setPayments(payments);
    } catch {
      /* non-critical */
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Everything on this profile is non-critical individually — pull each in
      // parallel and show whatever succeeds.
      const [rep, appt, pay] = await Promise.allSettled([
        listPatientReports(patient.id),
        listAppointments({ patient: patient.id, scope: 'all' }),
        listPayments(patient.id),
      ]);
      if (cancelled) return;
      if (rep.status === 'fulfilled') setReports(rep.value.reports);
      if (appt.status === 'fulfilled') setAppointments(appt.value.appointments);
      if (pay.status === 'fulfilled') setPayments(pay.value.payments);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 font-medium mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back to patients
      </button>

      {/* Patient header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {current.name}
              <span className="ml-3 text-sm font-mono text-gray-400">{current.patientId}</span>
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {[current.age ? `${current.age} yrs` : null, current.gender || null, current.mobile || null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-xs text-gray-500">
              {current.email && <span>✉ {current.email}</span>}
              {current.height != null && <span>Height: {current.height} cm</span>}
              {current.weight != null && <span>Weight: {current.weight} kg</span>}
              <span>
                Doctor:{' '}
                {current.assignedDoctor && typeof current.assignedDoctor === 'object'
                  ? current.assignedDoctor.name
                  : '—'}
              </span>
              <span>Registered: {formatDate(current.createdAt)}</span>
            </div>
            {current.painAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {current.painAreas.map((a) => (
                  <span key={a} className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            )}
            {current.complaint && <p className="text-sm text-gray-600 mt-3 max-w-xl">{current.complaint}</p>}
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <button
              onClick={onStartAssessment}
              className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors"
            >
              <Stethoscope className="w-4 h-4" /> Start AI Assessment
            </button>
            {/* Correct a wrong entry, or remove a duplicate/double entry. */}
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => { setDelError(''); setConfirmDelete(true); }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold py-2 px-3 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Patient login — admin sets a password so the patient can sign in and
          see all their sessions & reports. */}
      {hasRole('admin') && <PatientLoginCard patient={current} />}

      {/* Progress: posture-score trend across sessions */}
      {!loading && reports.length > 0 && <ProgressCard reports={reports} />}

      {/* Reports timeline */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Reports Timeline</h3>
      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          No assessments yet. Start the first AI assessment for this patient.
        </div>
      ) : (
        <ol className="space-y-3">
          {reports.map((r) => (
            <li
              key={r.id}
              onClick={() => r.shareId && window.open(`/r/${r.shareId}`, '_blank', 'noopener')}
              className={`bg-white border border-gray-200 rounded-xl p-4 shadow-sm ${
                r.shareId ? 'cursor-pointer hover:border-green-300 hover:shadow transition' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-50 rounded-lg p-2">
                    <Activity className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Assessment'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.findingsCount} assessment{r.findingsCount === 1 ? '' : 's'} ·{' '}
                      <span className="text-red-500">{r.flaggedCount} flagged</span>
                      {typeof r.doctor === 'object' && r.doctor?.name ? ` · Dr. ${r.doctor.name}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.shareId && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </span>
                  )}
                  <p className={`text-2xl font-bold ${SCORE_COLOR(r.overallScore)}`}>
                    {r.overallScore ?? '—'}
                    <span className="text-sm text-gray-400">/100</span>
                  </p>
                </div>
              </div>
              {r.doctorNotes && (
                <p className="text-sm text-gray-600 mt-3 border-t border-gray-100 pt-3">
                  <span className="font-medium text-gray-700">Notes: </span>
                  {r.doctorNotes}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Schedule: this patient's appointments */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-8">Schedule</h3>
      {loading ? (
        <div className="p-6 text-center text-gray-500">Loading appointments…</div>
      ) : appointments.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 text-sm">
          No appointments booked for this patient.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appointments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{formatDate(a.scheduledAt, true)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {a.doctor && typeof a.doctor === 'object' ? a.doctor.name : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.reason || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${APPT_BADGE[a.status]}`}>
                      {a.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Billing — visible to doctor & admin; admin can record a new payment. */}
      <div className="flex items-center justify-between mb-3 mt-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Billing
          {!loading && payments.length > 0 && (
            <span className="ml-2 normal-case text-gray-900 font-bold">{formatMoney(totalPaid)} paid</span>
          )}
        </h3>
        {isAdmin && (
          <button
            onClick={() => setBilling(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Record payment
          </button>
        )}
      </div>
      {loading ? (
        <div className="p-6 text-center text-gray-500">Loading payments…</div>
      ) : payments.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 text-sm">
          <IndianRupee className="w-6 h-6 mx-auto mb-2 text-gray-300" />
          No payments recorded for this patient.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Service</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Collected by</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{p.method}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.plan || '—'}
                    {p.notes && <span className="block text-xs text-gray-400">{p.notes}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PAY_BADGE[p.status]}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.collectedByName || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.createdAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Documents — X-rays, prescriptions, outside reports. Uploaded by
          reception/doctor/admin; multiple files per patient. */}
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-8">Documents</h3>
      <PatientDocuments patientId={current.id} />

      {billing && (
        <RecordPaymentModal
          presetPatient={current}
          onClose={() => setBilling(false)}
          onRecorded={loadPayments}
        />
      )}

      {editing && (
        <PatientEditModal
          patient={current}
          onClose={() => setEditing(false)}
          onSaved={setCurrent}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-6 hm-page-enter">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">Delete patient?</h3>
            </div>
            <p className="text-sm text-slate-600">
              This permanently removes <b>{current.name}</b> ({current.patientId}). Use this for a
              duplicate/double entry. Any existing reports remain as history.
            </p>
            {delError && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{delError}</div>
            )}
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="flex-1 border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Posture-score progress across a patient's sessions. `reports` arrive
// newest-first; we render the trend oldest→newest so improvement reads L→R.
function ProgressCard({ reports }: { reports: Report[] }) {
  const scored = [...reports].reverse().filter((r) => typeof r.overallScore === 'number');
  const latest = reports.find((r) => typeof r.overallScore === 'number')?.overallScore ?? null;
  const scores = scored.map((r) => r.overallScore as number);
  const best = scores.length ? Math.max(...scores) : null;
  // Change = latest scored session vs the one before it.
  const delta =
    scores.length >= 2 ? scores[scores.length - 1] - scores[scores.length - 2] : null;

  const Trend = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const trendColor = delta == null || delta === 0 ? 'text-gray-400' : delta > 0 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4 text-green-600" />
        <h3 className="font-semibold text-gray-900">Progress</h3>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-xs text-gray-500">Latest score</p>
          <p className={`text-2xl font-bold ${SCORE_COLOR(latest)}`}>{latest ?? '—'}<span className="text-sm text-gray-400">/100</span></p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Change</p>
          <p className={`text-2xl font-bold inline-flex items-center gap-1 ${trendColor}`}>
            <Trend className="w-5 h-5" />
            {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Best · Sessions</p>
          <p className="text-2xl font-bold text-gray-900">
            {best ?? '—'}
            <span className="text-sm text-gray-400"> · {reports.length}</span>
          </p>
        </div>
      </div>
      {/* Mini bar chart of each scored session, oldest → newest */}
      {scored.length > 0 && (
        <div className="flex items-end gap-1.5 h-24">
          {scored.map((r, i) => {
            const s = r.overallScore as number;
            return (
              <div
                key={r.id ?? i}
                className="flex-1 min-w-1.5 flex flex-col items-center gap-1"
                title={`${s}/100 · ${r.createdAt ? formatDate(r.createdAt) : ''}`}
              >
                <div className="w-full rounded-t bg-gray-100 flex items-end" style={{ height: '100%' }}>
                  <div className={`w-full rounded-t ${SCORE_BG(s)}`} style={{ height: `${Math.max(4, s)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Admin-only card to create or reset a patient's login. The login id is the
// patient's email; once a password is set the patient can sign in at /login and
// see all their sessions and reports.
function PatientLoginCard({ patient }: { patient: Patient }) {
  const [status, setStatus] = useState<PatientAccountStatus | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPatientAccount(patient.id)
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus(null));
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

  const noEmail = !patient.email;

  const save = async () => {
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await setPatientAccount(patient.id, password);
      setSavedPassword(password);
      setPassword('');
      const s = await getPatientAccount(patient.id);
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set login');
    } finally {
      setSaving(false);
    }
  };

  const copyCreds = () => {
    if (!status?.email || !savedPassword) return;
    navigator.clipboard
      ?.writeText(`Login: ${status.email}\nPassword: ${savedPassword}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-green-600" />
        <h3 className="font-semibold text-gray-900">Patient Login</h3>
        {status?.hasAccount && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" /> Active
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Give this patient a login so they can sign in and view all their sessions & reports.
        Their login id is their email.
      </p>

      {noEmail ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
          Add an email to this patient first — it becomes their login id.
        </div>
      ) : status?.staff ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm">
          {patient.email} already belongs to a staff account, so it can't be used as a patient login.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Login id (email)</label>
              <input
                readOnly
                value={patient.email}
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {status?.hasAccount ? 'New password' : 'Set password'}
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 6 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

          {savedPassword && status && (
            <div className="mt-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-sm text-green-800 flex items-center justify-between gap-3">
              <span>
                Login ready — <b>{status.email}</b> / <b>{savedPassword}</b>. Share these with the patient.
              </span>
              <button
                onClick={copyCreds}
                className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-900 flex-shrink-0"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg text-sm transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              {saving ? 'Saving…' : status?.hasAccount ? 'Reset password' : 'Create login'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
