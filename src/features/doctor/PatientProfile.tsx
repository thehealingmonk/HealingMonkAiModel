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
} from 'lucide-react';
import {
  Patient,
  Report,
  listPatientReports,
  getPatientAccount,
  setPatientAccount,
  PatientAccountStatus,
} from '@/services/api';
import { useAuth } from '@/store/auth.store';

interface Props {
  patient: Patient;
  onBack: () => void;
  onStartAssessment: () => void;
}

const SCORE_COLOR = (score: number | null) =>
  score === null ? 'text-gray-400' : score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-500' : 'text-red-600';

export default function PatientProfile({ patient, onBack, onStartAssessment }: Props) {
  const { hasRole } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { reports } = await listPatientReports(patient.id);
        if (!cancelled) setReports(reports);
      } catch {
        /* timeline is non-critical; show empty on error */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patient.id]);

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
              {patient.name}
              <span className="ml-3 text-sm font-mono text-gray-400">{patient.patientId}</span>
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {[patient.age ? `${patient.age} yrs` : null, patient.gender || null, patient.mobile || null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
            {patient.painAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {patient.painAreas.map((a) => (
                  <span key={a} className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            )}
            {patient.complaint && <p className="text-sm text-gray-600 mt-3 max-w-xl">{patient.complaint}</p>}
          </div>
          <button
            onClick={onStartAssessment}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors"
          >
            <Stethoscope className="w-4 h-4" /> Start AI Assessment
          </button>
        </div>
      </div>

      {/* Patient login — admin sets a password so the patient can sign in and
          see all their sessions & reports. */}
      {hasRole('admin') && <PatientLoginCard patient={patient} />}

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
