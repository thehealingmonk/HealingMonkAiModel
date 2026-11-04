import { LayoutGrid, CalendarDays, Users, FileText, IndianRupee, UserCog, Video, CalendarCheck } from 'lucide-react';
import { Routes, Route, Navigate, Outlet, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/store/auth.store';
import DashboardShell, { dashNavCls } from '@/components/layout/DashboardShell';
import { Role } from '@/services/api';
import AdminDashboard from '@/features/admin/AdminDashboard';
import UserManagement from '@/features/admin/UserManagement';
import PatientsList from '@/features/admin/PatientsList';
import ReportsList from '@/features/admin/ReportsList';
import MeetingsScheduler from '@/features/admin/MeetingsScheduler';
import AppointmentsList from '@/features/admin/AppointmentsList';
import PaymentsList from '@/features/admin/PaymentsList';
import AttendanceDesk from '@/features/attendance/AttendanceDesk';
import ReceptionDashboard from '@/features/reception/ReceptionDashboard';
import BookAppointment from '@/features/reception/BookAppointment';
import { usePatientFlow } from '@/features/admin/patientFlow';

// Admin (s-admin) URL space:
//   /admin              → overview (live totals)
//   /admin/patients     → all patients (click a row to open its profile)
//   /admin/patient/:id  → patient profile + reports timeline + Start AI Assessment
//   /admin/patient/:id/assess[/capture|/report] → the AI assessment flow (fullscreen)
//   /admin/reports      → all assessment reports
//   /admin/appointments → all appointments
//   /admin/payments     → all payments
//   /admin/attendance   → monthly package attendance desk
//   /admin/users        → user management (?role= to pre-filter)
//   /admin/schedule     → clinic schedule (calendar) + /admin/book
const NAV = [
  { to: '/admin', end: true, icon: LayoutGrid, label: 'Overview' },
  { to: '/admin/patients', icon: Users, label: 'Patients' },
  { to: '/admin/reports', icon: FileText, label: 'Reports' },
  { to: '/admin/appointments', icon: CalendarDays, label: 'Appointments' },
  { to: '/admin/meetings', icon: Video, label: 'Meetings' },
  { to: '/admin/payments', icon: IndianRupee, label: 'Payments' },
  { to: '/admin/attendance', icon: CalendarCheck, label: 'Attendance' },
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

export default function AdminApp() {
  const navigate = useNavigate();
  const { profileRoute, assessRoutes } = usePatientFlow('/admin');

  return (
    <Routes>
      <Route element={<Chrome />}>
        <Route index element={<AdminDashboard onNavigate={(p) => navigate(p)} />} />
        <Route path="patients" element={<PatientsList />} />
        {profileRoute}
        <Route path="reports" element={<ReportsList />} />
        <Route path="meetings" element={<MeetingsScheduler />} />
        <Route path="appointments" element={<AppointmentsList />} />
        <Route path="payments" element={<PaymentsList />} />
        <Route path="attendance" element={<AttendanceDesk profileBase="/admin/patient" />} />
        <Route path="users" element={<UsersRoute />} />
        <Route path="schedule" element={<ReceptionDashboard onBook={() => navigate('/admin/book')} />} />
        <Route
          path="book"
          element={<BookAppointment onBack={() => navigate('/admin/schedule')} onBooked={() => navigate('/admin/schedule')} />}
        />
      </Route>

      {/* Fullscreen AI assessment flow (no chrome) */}
      {assessRoutes}

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
