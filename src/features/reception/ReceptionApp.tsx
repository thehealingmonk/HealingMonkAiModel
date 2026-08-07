import { Activity, LogOut, UserPlus, CalendarDays, IndianRupee } from 'lucide-react';
import { Routes, Route, Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth.store';
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
const navCls = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
    isActive ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'
  }`;

function Chrome() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-green-600 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight">HealingMonk</p>
              <p className="text-xs text-gray-500 leading-tight">Reception Desk</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:inline">{user?.name}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2">
          <NavLink to="/reception" end className={navCls}>
            <CalendarDays className="w-4 h-4" /> Schedule
          </NavLink>
          <NavLink to="/reception/register" className={navCls}>
            <UserPlus className="w-4 h-4" /> Register patient
          </NavLink>
          <NavLink to="/reception/collections" className={navCls}>
            <IndianRupee className="w-4 h-4" /> Billing
          </NavLink>
        </div>
      </div>

      <main className="px-4 py-8">
        <Outlet />
      </main>
    </div>
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
