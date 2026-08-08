import { useEffect, useState } from 'react';
import { LayoutGrid, CalendarDays, Users, FileText, IndianRupee, UserCog } from 'lucide-react';
import { Routes, Route, Navigate, Outlet, NavLink, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '@/store/auth.store';
import DashboardShell, { dashNavCls } from '@/components/layout/DashboardShell';
import { Role, Patient, getPatient } from '@/services/api';
import { CLINICAL_ASSESSMENTS, AssessmentCapture } from '@/lib/clinicalKnowledge';
import AdminDashboard from '@/features/admin/AdminDashboard';
import UserManagement from '@/features/admin/UserManagement';
import PatientsList from '@/features/admin/PatientsList';
import ReportsList from '@/features/admin/ReportsList';
import AppointmentsList from '@/features/admin/AppointmentsList';
import PaymentsList from '@/features/admin/PaymentsList';
import ReceptionDashboard from '@/features/reception/ReceptionDashboard';
import BookAppointment from '@/features/reception/BookAppointment';
import PatientProfile from '@/features/doctor/PatientProfile';
import DoctorReportView from '@/features/doctor/DoctorReportView';
import PositionSelect from '@/features/assessment/PositionSelect';
import ClinicalCapture from '@/features/assessment/ClinicalCapture';

// Admin (s-admin) URL space:
//   /admin              → overview (live totals)
//   /admin/patients     → all patients (click a row to open its profile)
//   /admin/patient/:id  → patient profile + reports timeline + Start AI Assessment
//   /admin/patient/:id/assess[/capture|/report] → the AI assessment flow (fullscreen)
//   /admin/reports      → all assessment reports
//   /admin/appointments → all appointments
//   /admin/payments     → all payments
//   /admin/users        → user management (?role= to pre-filter)
//   /admin/schedule     → clinic schedule (calendar) + /admin/book
const NAV = [
  { to: '/admin', end: true, icon: LayoutGrid, label: 'Overview' },
  { to: '/admin/patients', icon: Users, label: 'Patients' },
  { to: '/admin/reports', icon: FileText, label: 'Reports' },
  { to: '/admin/appointments', icon: CalendarDays, label: 'Appointments' },
  { to: '/admin/payments', icon: IndianRupee, label: 'Payments' },
  { to: '/admin/users', icon: UserCog, label: 'Users' },
];

function Chrome() {
  const { user, logout } = useAuth();
  return (
    <DashboardShell
      consoleName="Admin Console"
      userLabel={user?.name}
      onLogout={logout}
      nav={NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={dashNavCls}>
          <n.icon className="w-4 h-4" /> {n.label}
        </NavLink>
      ))}
    >
      <Outlet />
    </DashboardShell>
  );
}

function UsersRoute() {
  const [params] = useSearchParams();
  const role = (params.get('role') as Role | 'all') || 'all';
  return <UserManagement initialRole={role} />;
}

interface FlowProps {
  patient: Patient | null;
  setPatient: (p: Patient) => void;
}

// Patient profile: loads the record by URL id if it isn't already in memory
// (deep link / refresh), then shows the reports timeline + Start AI Assessment.
function ProfileRoute({ patient, setPatient, onStart }: FlowProps & { onStart: (p: Patient) => void }) {
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
  if (!p) return <Navigate to="/admin/patients" replace />;
  return <PatientProfile patient={p} onBack={() => navigate('/admin/patients')} onStartAssessment={() => onStart(p)} />;
}

// Pose selection (fullscreen). Ensures the patient is loaded so later steps have it.
function AssessRoute({
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
      onBack={() => navigate(`/admin/patient/${id}`)}
      onStart={(ids) => onStart(id!, ids)}
    />
  );
}

function RedirectToProfile() {
  const { id } = useParams();
  return <Navigate to={id ? `/admin/patient/${id}` : '/admin/patients'} replace />;
}

export default function AdminApp() {
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [assessmentIds, setAssessmentIds] = useState<string[]>([]);
  const [captures, setCaptures] = useState<AssessmentCapture[]>([]);

  return (
    <Routes>
      <Route element={<Chrome />}>
        <Route index element={<AdminDashboard onNavigate={(p) => navigate(p)} />} />
        <Route path="patients" element={<PatientsList />} />
        <Route
          path="patient/:id"
          element={
            <ProfileRoute
              patient={patient}
              setPatient={setPatient}
              onStart={(p) => {
                setPatient(p);
                setAssessmentIds([]);
                setCaptures([]);
                navigate(`/admin/patient/${p.id}/assess`);
              }}
            />
          }
        />
        <Route path="reports" element={<ReportsList />} />
        <Route path="appointments" element={<AppointmentsList />} />
        <Route path="payments" element={<PaymentsList />} />
        <Route path="users" element={<UsersRoute />} />
        <Route path="schedule" element={<ReceptionDashboard onBook={() => navigate('/admin/book')} />} />
        <Route
          path="book"
          element={<BookAppointment onBack={() => navigate('/admin/schedule')} onBooked={() => navigate('/admin/schedule')} />}
        />
      </Route>

      {/* Fullscreen AI assessment flow (no chrome) */}
      <Route
        path="patient/:id/assess"
        element={
          <AssessRoute
            patient={patient}
            setPatient={setPatient}
            initial={assessmentIds}
            onStart={(id, ids) => {
              setAssessmentIds(ids);
              navigate(`/admin/patient/${id}/assess/capture`);
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
              onBack={() => navigate(`/admin/patient/${patient.id}/assess`)}
              onComplete={(caps) => {
                setCaptures(caps);
                navigate(`/admin/patient/${patient.id}/assess/report`);
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
              onDone={() => navigate(`/admin/patient/${patient.id}`)}
            />
          ) : (
            <RedirectToProfile />
          )
        }
      />

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
