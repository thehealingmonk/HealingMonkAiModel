import { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, RefreshCw, Clock, CheckCircle2, XCircle, UserX } from 'lucide-react';
import TableSkeleton from '@/components/ui/TableSkeleton';
import {
  Appointment,
  AppointmentStatus,
  listAppointments,
  setAppointmentStatus,
} from '@/services/api';

interface Props {
  onBook: () => void;
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  scheduled: 'bg-sky-50 text-sky-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
  no_show: 'bg-slate-100 text-slate-600',
};

function name(ref: Appointment['patient']) {
  return ref && typeof ref === 'object' ? ref.name : '—';
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Reception home: the day's schedule with quick status changes + a Book button.
export default function ReceptionDashboard({ onBook }: Props) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { appointments } = await listAppointments({ date });
      setAppts(appointments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load appointments');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (id: string, status: AppointmentStatus) => {
    // Optimistic update.
    setAppts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    try {
      await setAppointmentStatus(id, status);
    } catch {
      load(); // revert by reloading on failure
    }
  };

  return (
    <div className="hm-page-enter max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Today's schedule</h2>
          <p className="text-slate-500 text-sm">Book and manage patient appointments.</p>
        </div>
        <button
          onClick={onBook}
          className="hm-lift inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-2.5 px-4 rounded-lg"
        >
          <CalendarPlus className="w-4 h-4" /> Book appointment
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100" data-reveal>
        {loading ? (
          <TableSkeleton rows={5} cols={4} />
        ) : appts.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-10 text-center">
            No appointments for this day.
          </p>
        ) : (
          appts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-emerald-50/40 transition-colors">
              <div className="flex items-center gap-2 text-slate-900 font-semibold w-20">
                <Clock className="w-4 h-4 text-slate-400" />
                {timeOf(a.scheduledAt)}
              </div>
              <div className="flex-1 min-w-[8rem]">
                <p className="font-medium text-gray-900">{name(a.patient)}</p>
                <p className="text-xs text-gray-500">
                  {typeof a.doctor === 'object' && a.doctor ? `Dr. ${a.doctor.name}` : 'Unassigned'}
                  {a.reason ? ` · ${a.reason}` : ''}
                </p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[a.status]}`}
              >
                {a.status.replace('_', ' ')}
              </span>
              <div className="flex items-center gap-1">
                <IconBtn
                  title="Mark completed"
                  onClick={() => changeStatus(a.id, 'completed')}
                  className="text-green-600 hover:bg-green-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </IconBtn>
                <IconBtn
                  title="No show"
                  onClick={() => changeStatus(a.id, 'no_show')}
                  className="text-gray-500 hover:bg-gray-100"
                >
                  <UserX className="w-4 h-4" />
                </IconBtn>
                <IconBtn
                  title="Cancel"
                  onClick={() => changeStatus(a.id, 'cancelled')}
                  className="text-red-600 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4" />
                </IconBtn>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  className = '',
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-md transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
