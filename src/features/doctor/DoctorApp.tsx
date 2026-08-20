import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/store/auth.store';
import DashboardShell from '@/components/layout/DashboardShell';
import { Patient, getPatient, listIdealPostures } from '@/services/api';
import { CLINICAL_ASSESSMENTS, AssessmentCapture } from '@/lib/clinicalKnowledge';
import DoctorDashboard from '@/features/doctor/DoctorDashboard';
import PatientForm from '@/features/doctor/PatientForm';
import PatientProfile from '@/features/doctor/PatientProfile';
import DoctorReportView from '@/features/doctor/DoctorReportView';
import IdealPostures from '@/features/doctor/IdealPostures';
import PositionSelect from '@/features/assessment/PositionSelect';
import ClinicalCapture from '@/features/assessment/ClinicalCapture';

// Doctor URL space:
//   /doctor                              → patients list
//   /doctor/register                     → register patient
//   /doctor/patient/:id                  → patient profile + reports timeline
//   /doctor/patient/:id/assess           → choose poses        (fullscreen)
//   /doctor/patient/:id/assess/capture   → live capture        (fullscreen)
//   /doctor/patient/:id/assess/report    → report (auto-saved) (fullscreen)
// The capture/report state is held in DoctorApp so it survives the sub-steps; a
// hard refresh mid-flow falls back to the patient profile.

function Chrome() {
  const { user, logout } = useAuth();
  return (
    <DashboardShell consoleName="Doctor Console" userLabel={user ? `Dr. ${user.name}` : undefined} onLogout={logout} maxWidth="max-w-4xl">
      <Outlet />
    </DashboardShell>
  );
}

interface ProfileRouteProps {
  patient: Patient | null;
  setPatient: (p: Patient) => void;
  onStart: (p: Patient) => void;
}

// Renders the patient profile, loading the record by URL id if it isn't already
// in memory (deep link / refresh).
function ProfileRoute({ patient, setPatient, onStart }: ProfileRouteProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const match = patient && patient.id === id ? patient : null;
  const [p, setP] = useState<Patient | null>(match);
  const [loading, setLoading] = useState(!match);

  useEffect(() => {
    if (match) {
      setP(match);
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (id) {
      getPatient(id)
        .then((r) => {
          if (cancelled) return;
          setP(r.patient);
          setPatient(r.patient);
          setLoading(false);
        })
        .catch(() => !cancelled && setLoading(false));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <div className="p-10 text-center text-gray-500">Loading patient…</div>;
  if (!p) return <Navigate to="/doctor" replace />;
  return <PatientProfile patient={p} onBack={() => navigate('/doctor')} onStartAssessment={() => onStart(p)} />;
}

interface AssessRouteProps {
  patient: Patient | null;
  setPatient: (p: Patient) => void;
  initial: string[];
  onStart: (id: string, ids: string[]) => void;
}

// Pose selection (fullscreen). Ensures the patient is loaded so later steps have it.
function AssessRoute({ patient, setPatient, initial, onStart }: AssessRouteProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  useEffect(() => {
    if ((!patient || patient.id !== id) && id) {
      getPatient(id)
        .then((r) => setPatient(r.patient))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return (
    <PositionSelect
      initial={initial}
      onBack={() => navigate(`/doctor/patient/${id}`)}
      onStart={(ids) => onStart(id!, ids)}
    />
  );
}

function RedirectToProfile() {
  const { id } = useParams();
  return <Navigate to={id ? `/doctor/patient/${id}` : '/doctor'} replace />;
}

export default function DoctorApp() {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assessmentIds, setAssessmentIds] = useState<string[]>([]);
  const [captures, setCaptures] = useState<AssessmentCapture[]>([]);

  return (
    <Routes>
      {/* Chrome'd pages */}
      <Route element={<Chrome />}>
        <Route
          index
          element={
            <DoctorDashboard
              onRegister={() => navigate('/doctor/register')}
              onManageIdeal={() => navigate('/doctor/ideal-postures')}
              onOpenPatient={(p) => {
                setPatient(p);
                navigate(`/doctor/patient/${p.id}`);
              }}
            />
          }
        />
        <Route
          path="register"
          element={
            <PatientForm
              onBack={() => navigate('/doctor')}
              onCreated={(p) => {
                setPatient(p);
                navigate(`/doctor/patient/${p.id}`);
              }}
            />
          }
        />
        <Route path="ideal-postures" element={<IdealPostures onBack={() => navigate('/doctor')} />} />
        <Route
          path="patient/:id"
          element={
            <ProfileRoute
              patient={patient}
              setPatient={setPatient}
              onStart={async (p) => {
                setPatient(p);
                setCaptures([]);
                // Pre-select the capture poses the doctor curated for this
                // patient's pain areas, so the position screen opens with the
                // relevant poses already ticked (defaults still apply if none).
                let preset: string[] = [];
                if (p.painAreas?.length) {
                  try {
                    const { sets } = await listIdealPostures(p.painAreas);
                    const ids = new Set(sets.flatMap((s) => s.poses ?? []));
                    preset = CLINICAL_ASSESSMENTS.filter((a) => ids.has(a.id)).map((a) => a.id);
                  } catch {
                    /* Non-fatal — fall back to the default selection. */
                  }
                }
                setAssessmentIds(preset);
                navigate(`/doctor/patient/${p.id}/assess`);
              }}
            />
          }
        />
      </Route>

      {/* Fullscreen assessment flow (no chrome) */}
      <Route
        path="patient/:id/assess"
        element={
          <AssessRoute
            patient={patient}
            setPatient={setPatient}
            initial={assessmentIds}
            onStart={(id, ids) => {
              setAssessmentIds(ids);
              navigate(`/doctor/patient/${id}/assess/capture`);
            }}
          />
        }
      />
      <Route
        path="patient/:id/assess/capture"
        element={
          patient && assessmentIds.length > 0 ? (
            <ClinicalCapture
              assessments={CLINICAL_ASSESSMENTS.filter((a) => assessmentIds.includes(a.id))}
              onBack={() => navigate(`/doctor/patient/${patient.id}/assess`)}
              onComplete={(caps) => {
                setCaptures(caps);
                navigate(`/doctor/patient/${patient.id}/assess/report`);
              }}
            />
          ) : (
            <RedirectToProfile />
          )
        }
      />
      <Route
        path="patient/:id/assess/report"
        element={
          patient && captures.length > 0 ? (
            <DoctorReportView
              patient={patient}
              captures={captures}
              onDone={() => navigate(`/doctor/patient/${patient.id}`)}
            />
          ) : (
            <RedirectToProfile />
          )
        }
      />

      <Route path="*" element={<Navigate to="/doctor" replace />} />
    </Routes>
  );
}
