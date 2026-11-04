import { useEffect, useState } from 'react';
import { Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Patient, getPatient } from '@/services/api';
import { CLINICAL_ASSESSMENTS, AssessmentCapture } from '@/lib/clinicalKnowledge';
import PatientProfile from '@/features/doctor/PatientProfile';
import DoctorReportView from '@/features/doctor/DoctorReportView';
import PositionSelect from '@/features/assessment/PositionSelect';
import ClinicalCapture from '@/features/assessment/ClinicalCapture';

// Patient profile + AI assessment flow, shared by the admin and reception
// consoles. `base` is the console root, e.g. '/admin' or '/reception':
//   {base}/patients     → list (wired by the console)
//   {base}/patient/:id  → profile + reports timeline + Start AI Assessment
//   {base}/patient/:id/assess[/capture|/report] → the AI assessment flow (fullscreen)

interface FlowProps {
  base: string;
  patient: Patient | null;
  setPatient: (p: Patient) => void;
}

// Loads the record by URL id if it isn't already in memory (deep link / refresh).
function ProfileRoute({ base, patient, setPatient, onStart }: FlowProps & { onStart: (p: Patient) => void }) {
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
  if (!p) return <Navigate to={`${base}/patients`} replace />;
  return <PatientProfile patient={p} onBack={() => navigate(`${base}/patients`)} onStartAssessment={() => onStart(p)} />;
}

// Pose selection (fullscreen). Ensures the patient is loaded so later steps have it.
function AssessRoute({
  base,
  patient,
  setPatient,
  initial,
  onStart,
}: FlowProps & { initial: string[]; onStart: (id: string, ids: string[]) => void }) {
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
      onBack={() => navigate(`${base}/patient/${id}`)}
      onStart={(ids) => onStart(id!, ids)}
    />
  );
}

function RedirectToProfile({ base }: { base: string }) {
  const { id } = useParams();
  return <Navigate to={id ? `${base}/patient/${id}` : `${base}/patients`} replace />;
}

/** State for the assessment flow; call once in the console component. */
export function usePatientFlow(base: string) {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assessmentIds, setAssessmentIds] = useState<string[]>([]);
  const [captures, setCaptures] = useState<AssessmentCapture[]>([]);

  // Profile route — goes inside the console chrome.
  const profileRoute = (
    <Route
      path="patient/:id"
      element={
        <ProfileRoute
          base={base}
          patient={patient}
          setPatient={setPatient}
          onStart={(p) => {
            setPatient(p);
            setAssessmentIds([]);
            setCaptures([]);
            navigate(`${base}/patient/${p.id}/assess`);
          }}
        />
      }
    />
  );

  // Fullscreen AI assessment routes (no chrome).
  const assessRoutes = [
    <Route
      key="assess"
      path="patient/:id/assess"
      element={
        <AssessRoute
          base={base}
          patient={patient}
          setPatient={setPatient}
          initial={assessmentIds}
          onStart={(id, ids) => {
            setAssessmentIds(ids);
            navigate(`${base}/patient/${id}/assess/capture`);
          }}
        />
      }
    />,
    <Route
      key="capture"
      path="patient/:id/assess/capture"
      element={
        patient && assessmentIds.length > 0 ? (
          <ClinicalCapture
            assessments={CLINICAL_ASSESSMENTS.filter((a) => assessmentIds.includes(a.id))}
            onBack={() => navigate(`${base}/patient/${patient.id}/assess`)}
            onComplete={(caps) => {
              setCaptures(caps);
              navigate(`${base}/patient/${patient.id}/assess/report`);
            }}
          />
        ) : (
          <RedirectToProfile base={base} />
        )
      }
    />,
    <Route
      key="report"
      path="patient/:id/assess/report"
      element={
        patient && captures.length > 0 ? (
          <DoctorReportView
            patient={patient}
            captures={captures}
            onDone={() => navigate(`${base}/patient/${patient.id}`)}
          />
        ) : (
          <RedirectToProfile base={base} />
        )
      }
    />,
  ];

  return { profileRoute, assessRoutes };
}
