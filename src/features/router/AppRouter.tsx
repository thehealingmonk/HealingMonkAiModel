import { lazy, Suspense, ReactElement } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/store/auth.store';
import { Role } from '@/services/api';
import { isPanelLocked } from '@/lib/panelLock';
import RouteMeta from '@/components/common/RouteMeta';

// Each top-level app is lazy-loaded so a signed-in doctor never downloads the
// admin bundle, a guest never downloads any dashboard, and heavy dependencies
// (MediaPipe, jsPDF) stay inside the chunks that actually use them.
const PublicApp = lazy(() => import('@/features/public/PublicApp'));
const Login = lazy(() => import('@/features/auth/Login'));
const AdminApp = lazy(() => import('@/features/admin/AdminApp'));
const DoctorApp = lazy(() => import('@/features/doctor/DoctorApp'));
const ReceptionApp = lazy(() => import('@/features/reception/ReceptionApp'));
const PatientHome = lazy(() => import('@/features/patient/PatientHome'));
const MeetingRoom = lazy(() => import('@/features/meeting/MeetingRoom'));

// Each role gets its own URL space. Signed-in users land on their role home.
const HOME: Record<Role, string> = {
  admin: '/admin',
  doctor: '/doctor',
  reception: '/reception',
  patient: '/patient',
};

function Splash() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading…</p>
      </div>
    </div>
  );
}

// Guards a role's URL space: redirects guests to /login and wrong-role users to
// their own home.
function RequireRole({ role, children }: { role: Role; children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (user.role !== role) return <Navigate to={HOME[user.role]} replace />;
  return children;
}

// Home entry: a signed-in user who has "locked" the app to their panel jumps
// straight into that dashboard on launch instead of seeing the marketing home.
// Only the exact root ("/") redirects, so public pages (pricing, about, the free
// assessment demo) stay reachable.
function HomeEntry() {
  const { user } = useAuth();
  const location = useLocation();
  if (user && location.pathname === '/' && isPanelLocked()) {
    return <Navigate to={HOME[user.role]} replace />;
  }
  return <PublicApp />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;

  return (
    <Suspense fallback={<Splash />}>
    <RouteMeta />
    <Routes>
      {/* Auth */}
      <Route path="/login" element={user ? <Navigate to={HOME[user.role]} replace /> : <Login />} />

      {/* Online meeting room — reachable by everyone via the secure link token:
          the guest patient (no login), a signed-in patient, and staff (admin /
          assigned doctor). The server decides the caller's role from their auth,
          so this single route serves all three without leaking staff controls. */}
      <Route path="/m/:token" element={<MeetingRoom />} />

      {/* Role-scoped URL spaces */}
      <Route path="/admin/*" element={<RequireRole role="admin"><AdminApp /></RequireRole>} />
      <Route path="/doctor/*" element={<RequireRole role="doctor"><DoctorApp /></RequireRole>} />
      <Route path="/reception/*" element={<RequireRole role="reception"><ReceptionApp /></RequireRole>} />
      <Route path="/patient/*" element={<RequireRole role="patient"><PatientHome /></RequireRole>} />

      {/* Public site + free AI assessment demo (also the catch-all) */}
      <Route path="/*" element={<HomeEntry />} />
    </Routes>
    </Suspense>
  );
}
