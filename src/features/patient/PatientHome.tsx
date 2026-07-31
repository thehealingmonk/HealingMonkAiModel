import { useEffect, useState } from 'react';
import {
  Activity,
  LogOut,
  FileText,
  CalendarClock,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import {
  Report,
  Appointment,
  myReports,
  myAppointments,
} from '@/services/api';

function when(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// Patient panel: the signed-in patient sees their progress (assessment reports)
// and upcoming appointments. Data is matched to their clinic record by email.
export default function PatientHome() {
  const { user, logout } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([myReports(), myAppointments()]).then(([r, a]) => {
      if (cancelled) return;
      if (r.status === 'fulfilled') setReports(r.value.reports);
      if (a.status === 'fulfilled') setAppts(a.value.appointments);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = reports[0];
  const upcoming = appts.filter(
    (a) => a.status === 'scheduled' && new Date(a.scheduledAt) >= new Date()
  );
  // Every booked appointment is a clinic session (past or upcoming).
  const totalSessions = appts.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center shadow-sm shadow-emerald-500/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-tight">HealingMonk</p>
              <p className="text-xs text-slate-500 leading-tight">My Health</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:inline">{user?.name}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 font-medium"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="hm-page-enter max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-1" data-reveal="fade">Welcome, {user?.name}</h2>
        <p className="text-slate-500 mb-8" data-reveal="fade">Track your posture & movement progress here.</p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading your data…</p>
        ) : (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SummaryCard
                i={0}
                icon={<TrendingUp className="w-5 h-5" />}
                label="Latest score"
                value={latest?.overallScore != null ? `${latest.overallScore}` : '—'}
                tint="bg-emerald-50 text-emerald-700"
              />
              <SummaryCard
                i={1}
                icon={<FileText className="w-5 h-5" />}
                label="Reports"
                value={`${reports.length}`}
                tint="bg-sky-50 text-sky-700"
              />
              <SummaryCard
                i={2}
                icon={<CalendarClock className="w-5 h-5" />}
                label="Sessions"
                value={`${totalSessions}`}
                tint="bg-amber-50 text-amber-700"
              />
            </div>

            {upcoming.length > 0 && (
              <div data-reveal="fade" className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                <span className="font-semibold">Next session:</span> {when(upcoming[upcoming.length - 1].scheduledAt)}
                {typeof upcoming[upcoming.length - 1].doctor === 'object' && upcoming[upcoming.length - 1].doctor
                  ? ` · Dr. ${(upcoming[upcoming.length - 1].doctor as { name: string }).name}`
                  : ''}
              </div>
            )}

            {/* All sessions (appointments) — past & upcoming */}
            <section data-reveal>
              <h3 className="font-semibold text-slate-900 mb-3">My sessions ({totalSessions})</h3>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
                {appts.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-6 text-center">No sessions yet.</p>
                ) : (
                  appts.map((a) => (
                    <div key={a.id} className="px-4 py-3 flex items-center justify-between hover:bg-emerald-50/40 transition-colors">
                      <div>
                        <p className="font-medium text-slate-900">{when(a.scheduledAt)}</p>
                        <p className="text-xs text-slate-500">
                          {typeof a.doctor === 'object' && a.doctor ? `Dr. ${a.doctor.name}` : 'Doctor TBD'}
                          {a.reason ? ` · ${a.reason}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Reports / progress history */}
            <section data-reveal>
              <h3 className="font-semibold text-slate-900 mb-3">My assessment reports</h3>
              <div className="space-y-3">
                {reports.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl px-4 py-8 text-center">
                    <p className="text-sm text-slate-400">
                      No reports yet. After your assessment, your doctor's report appears here.
                    </p>
                  </div>
                ) : (
                  reports.map((r) => (
                    <div key={r.id} className="hm-lift bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            Posture & Movement Report
                          </p>
                          <p className="text-xs text-slate-500">
                            {when(r.createdAt)}
                            {typeof r.doctor === 'object' && r.doctor ? ` · Dr. ${r.doctor.name}` : ''}
                          </p>
                        </div>
                        {r.overallScore != null && (
                          <div className="text-right">
                            <p className="text-2xl font-bold text-emerald-600 leading-none">
                              {r.overallScore}
                            </p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">Score</p>
                          </div>
                        )}
                      </div>

                      {r.painAreas?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {r.painAreas.map((p) => (
                            <span
                              key={p}
                              className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}

                      {r.flaggedCount > 0 && (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {r.flaggedCount} finding{r.flaggedCount > 1 ? 's' : ''} need attention
                        </p>
                      )}

                      {r.suggestedExercises?.length > 0 && (
                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <p className="text-xs font-medium text-gray-700 mb-1">Suggested exercises</p>
                          <ul className="text-xs text-gray-600 space-y-0.5">
                            {r.suggestedExercises.slice(0, 4).map((ex, i) => (
                              <li key={i}>
                                • {ex.name} — {ex.sets} × {ex.reps} ({ex.frequency})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {r.doctorNotes && (
                        <p className="mt-3 text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                          <span className="font-medium">Doctor's note: </span>
                          {r.doctorNotes}
                        </p>
                      )}

                      {r.shareId && (
                        <div className="mt-3 border-t border-gray-100 pt-3">
                          <a
                            href={`/r/${r.shareId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                          >
                            <ExternalLink className="w-4 h-4" /> Open full report
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: 'bg-sky-50 text-sky-700',
    completed: 'bg-emerald-50 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-500',
    no_show: 'bg-red-50 text-red-600',
  };
  const label = status === 'no_show' ? 'No show' : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

function SummaryCard({
  i = 0,
  icon,
  label,
  value,
  tint,
}: {
  i?: number;
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div
      data-reveal="zoom"
      style={{ '--reveal-delay': `${i * 80}ms` } as React.CSSProperties}
      className="hm-lift bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tint}`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
