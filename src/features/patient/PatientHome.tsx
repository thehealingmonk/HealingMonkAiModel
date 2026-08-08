import { useEffect, useState } from 'react';
import {
  FileText,
  CalendarClock,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  IndianRupee,
  Wallet,
} from 'lucide-react';
import { useAuth } from '@/store/auth.store';
import DashboardShell from '@/components/layout/DashboardShell';
import {
  Report,
  Appointment,
  Payment,
  myReports,
  myAppointments,
  myPayments,
} from '@/services/api';
import { formatMoney } from '@/utils/formatter';

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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([myReports(), myAppointments(), myPayments()]).then(([r, a, p]) => {
      if (cancelled) return;
      if (r.status === 'fulfilled') setReports(r.value.reports);
      if (a.status === 'fulfilled') setAppts(a.value.appointments);
      if (p.status === 'fulfilled') {
        setPayments(p.value.payments);
        setTotalPaid(p.value.totalPaid);
      }
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
    <DashboardShell consoleName="My Health" userLabel={user?.name} onLogout={logout} maxWidth="max-w-4xl">
      <div className="hm-page-enter mx-auto max-w-4xl">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-1" data-reveal="fade">Welcome, {user?.name}</h2>
        <p className="text-slate-400 mb-8" data-reveal="fade">Track your posture & movement progress here.</p>

        {loading ? (
          <p className="text-sm text-slate-400">Loading your data…</p>
        ) : (
          <div className="space-y-8">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <SummaryCard
                i={0}
                icon={<TrendingUp className="w-5 h-5" />}
                label="Latest score"
                value={latest?.overallScore != null ? `${latest.overallScore}` : '—'}
                tint="bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20"
              />
              <SummaryCard
                i={1}
                icon={<FileText className="w-5 h-5" />}
                label="Reports"
                value={`${reports.length}`}
                tint="bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20"
              />
              <SummaryCard
                i={2}
                icon={<CalendarClock className="w-5 h-5" />}
                label="Sessions"
                value={`${totalSessions}`}
                tint="bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20"
              />
              <SummaryCard
                i={3}
                icon={<Wallet className="w-5 h-5" />}
                label="Total paid"
                value={formatMoney(totalPaid)}
                tint="bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20"
              />
            </div>

            {upcoming.length > 0 && (
              <div data-reveal="fade" className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-200">
                <span className="font-semibold">Next session:</span> {when(upcoming[upcoming.length - 1].scheduledAt)}
                {typeof upcoming[upcoming.length - 1].doctor === 'object' && upcoming[upcoming.length - 1].doctor
                  ? ` · Dr. ${(upcoming[upcoming.length - 1].doctor as { name: string }).name}`
                  : ''}
              </div>
            )}

            {/* All sessions (appointments) — past & upcoming */}
            <section data-reveal>
              <h3 className="font-semibold text-white mb-3">My sessions ({totalSessions})</h3>
              <div className="glass-dark rounded-2xl divide-y divide-white/10">
                {appts.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-6 text-center">No sessions yet.</p>
                ) : (
                  appts.map((a) => (
                    <div key={a.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div>
                        <p className="font-medium text-white">{when(a.scheduledAt)}</p>
                        <p className="text-xs text-slate-400">
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

            {/* Payments / receipts */}
            <section data-reveal>
              <h3 className="font-semibold text-white mb-3">My payments</h3>
              <div className="glass-dark rounded-2xl divide-y divide-white/10">
                {payments.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-6 text-center">No payments recorded yet.</p>
                ) : (
                  payments.map((p) => (
                    <div key={p.id} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20 flex items-center justify-center">
                          <IndianRupee className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-white">{p.plan || 'Consultation / service'}</p>
                          <p className="text-xs text-slate-400">
                            {when(p.createdAt)} · <span className="capitalize">{p.method}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">{formatMoney(p.amount, p.currency)}</p>
                        <PaymentBadge status={p.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Reports / progress history */}
            <section data-reveal>
              <h3 className="font-semibold text-white mb-3">My assessment reports</h3>
              <div className="space-y-3">
                {reports.length === 0 ? (
                  <div className="glass-dark rounded-2xl px-4 py-8 text-center">
                    <p className="text-sm text-slate-400">
                      No reports yet. After your assessment, your doctor's report appears here.
                    </p>
                  </div>
                ) : (
                  reports.map((r) => (
                    <div key={r.id} className="glass-dark glass-dark-lift rounded-2xl p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-white">
                            Posture & Movement Report
                          </p>
                          <p className="text-xs text-slate-400">
                            {when(r.createdAt)}
                            {typeof r.doctor === 'object' && r.doctor ? ` · Dr. ${r.doctor.name}` : ''}
                          </p>
                        </div>
                        {r.overallScore != null && (
                          <div className="text-right">
                            <p className="scan-glow-text text-2xl font-bold leading-none">
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
                              className="text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded-full"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}

                      {r.flaggedCount > 0 && (
                        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {r.flaggedCount} finding{r.flaggedCount > 1 ? 's' : ''} need attention
                        </p>
                      )}

                      {r.suggestedExercises?.length > 0 && (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <p className="text-xs font-medium text-slate-200 mb-1">Suggested exercises</p>
                          <ul className="text-xs text-slate-400 space-y-0.5">
                            {r.suggestedExercises.slice(0, 4).map((ex, i) => (
                              <li key={i}>
                                • {ex.name} — {ex.sets} × {ex.reps} ({ex.frequency})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {r.doctorNotes && (
                        <p className="mt-3 text-sm text-slate-200 bg-white/5 rounded-lg p-3">
                          <span className="font-medium">Doctor's note: </span>
                          {r.doctorNotes}
                        </p>
                      )}

                      {r.shareId && (
                        <div className="mt-3 border-t border-white/10 pt-3">
                          <a
                            href={`/r/${r.shareId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
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
      </div>
    </DashboardShell>
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

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700',
    created: 'bg-sky-50 text-sky-700',
    failed: 'bg-red-50 text-red-600',
    refunded: 'bg-amber-50 text-amber-700',
  };
  return (
    <span className={`inline-block mt-0.5 text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
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
      className="glass-dark glass-dark-lift rounded-2xl p-5"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tint}`}>{icon}</div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}
