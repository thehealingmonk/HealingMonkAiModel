import { UserPlus, CalendarDays, IndianRupee } from 'lucide-react';
import { Routes, Route, Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth.store';
import DashboardShell, { dashNavCls } from '@/components/layout/DashboardShell';
import ReceptionDashboard from '@/features/reception/ReceptionDashboard';
import ReceptionCollections from '@/features/reception/ReceptionCollections';
import ReceptionBilling from '@/features/reception/ReceptionBilling';
import BookAppointment from '@/features/reception/BookAppointment';
import PatientForm from '@/features/doctor/PatientForm';

// Reception URL space:
//   /reception             → today's schedule
//   /reception/register    → register patient (+ assign doctor)
//   /reception/book        → book appointment
//   /reception/collections → all-time collections
function Chrome() {
  const { user, logout } = useAuth();
  return (
    <DashboardShell
      consoleName="Reception Desk"
      userLabel={user?.name}
      onLogout={logout}
      maxWidth="max-w-4xl"
      nav={
        <>
          <NavLink to="/reception" end className={dashNavCls}>
            <CalendarDays className="w-4 h-4" /> Schedule
          </NavLink>
          <NavLink to="/reception/register" className={dashNavCls}>
            <UserPlus className="w-4 h-4" /> Register patient
          </NavLink>
          <NavLink to="/reception/collections" className={dashNavCls}>
            <IndianRupee className="w-4 h-4" /> Billing
          </NavLink>
        </>
      }
    >
      <Outlet />
    </DashboardShell>
  );
}

export default function ReceptionApp() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route element={<Chrome />}>
        <Route index element={<ReceptionDashboard onBook={() => navigate('/reception/book')} />} />
        <Route
          path="register"
          element={
            <PatientForm
              showAssignDoctor
              onBack={() => navigate('/reception')}
              onCreated={() => navigate('/reception')}
            />
          }
        />
        <Route path="collections" element={<ReceptionCollections />} />
        <Route path="billing" element={<ReceptionBilling />} />
        <Route
          path="book"
          element={<BookAppointment onBack={() => navigate('/reception')} onBooked={() => navigate('/reception')} />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/reception" replace />} />
    </Routes>
  );
}
