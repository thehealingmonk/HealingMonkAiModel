import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Users,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Check,
  Undo2,
  ChevronDown,
  ExternalLink,
  CalendarX,
  Pencil,
  IndianRupee,
} from 'lucide-react';
import {
  Patient,
  PatientPackage,
  listPackages,
  markAttendance,
  unmarkAttendance,
  updatePackage,
  deletePackage,
} from '@/services/api';
import { useAuth } from '@/store/auth.store';
import { istDay, formatDay } from '@/lib/packageDates';
import { daysLeft, sessionsLeft, isExpiring, isExhausted, sessionsLabel } from '@/features/attendance/packageInfo';
import AttendanceCalendar from '@/features/attendance/AttendanceCalendar';
import PackageModal from '@/features/attendance/PackageModal';
import PaymentBadge from '@/features/attendance/PaymentBadge';
import RecordPaymentModal from '@/features/reception/RecordPaymentModal';
import { formatMoney } from '@/utils/formatter';

type Tab = 'today' | 'expiring' | 'expired';

interface Props {
  /** Base path of the patient profile route, e.g. "/admin/patient" (omit if the role has none). */
  profileBase?: string;
}

// The daily attendance desk for monthly-package patients. Reception searches a
// name and taps "Mark present" — one tap per visit. Packages running low on
// days/sessions and recently-lapsed ones are surfaced for renewal.
export default function AttendanceDesk({ profileBase }: Props) {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canManage = hasRole('admin', 'reception');

  const [packages, setPackages] = useState<PatientPackage[]>([]);
  const [today, setToday] = useState(istDay());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('today');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null); // `${pkgId}:${day}`
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renewing, setRenewing] = useState<PatientPackage | null>(null);
  const [editing, setEditing] = useState<PatientPackage | null>(null);
  const [collecting, setCollecting] = useState<PatientPackage | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await listPackages();
      setPackages(r.packages);
      setToday(r.today);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load packages');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replace = (pkg: PatientPackage) => setPackages((list) => list.map((p) => (p.id === pkg.id ? pkg : p)));

  const toggle = async (pkg: PatientPackage, day: string, present: boolean) => {
    setBusy(`${pkg.id}:${day}`);
    setError('');
    try {
      // A day outside the package period (an old client's earlier visit)
      // stretches the period to cover it, after confirming.
      const outside = day < pkg.startDay || day > pkg.endDay;
      if (present && outside && !window.confirm(`${formatDay(day)} is outside this package (${formatDay(pkg.startDay)} – ${formatDay(pkg.endDay)}). Extend the package to include it?`)) return;
      const r = present ? await markAttendance(pkg.id, day, outside) : await unmarkAttendance(pkg.id, day);
      replace(r.package);
    } catch (err) {
      setError(`${pkg.patientName}: ${err instanceof Error ? err.message : 'Could not update attendance'}`);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (pkg: PatientPackage) => {
    if (!window.confirm(`Cancel "${pkg.name}" for ${pkg.patientName}? Attendance history is kept.`)) return;
    try {
      await updatePackage(pkg.id, { status: 'cancelled' });
      setPackages((list) => list.filter((p) => p.id !== pkg.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel package');
    }
  };

  const remove = async (pkg: PatientPackage) => {
    if (!window.confirm(`Delete "${pkg.name}" for ${pkg.patientName} and all its attendance? This cannot be undone.`)) return;
    try {
      await deletePackage(pkg.id);
      setPackages((list) => list.filter((p) => p.id !== pkg.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete package');
    }
  };

  // A patient renewed early has both an active and an upcoming package; the
  // newer one makes the older "expiring/expired" nudge redundant.
  const renewedPatients = useMemo(() => {
    const s = new Set<string>();
    for (const p of packages) if (p.state === 'upcoming' || (p.state === 'active' && !isExpiring(p, today))) s.add(p.patient);
    return s;
  }, [packages, today]);

  const groups = useMemo(() => {
    const current = packages.filter((p) => p.state === 'active');
    const running = new Set(current.map((p) => p.patient));
    // Future-dated packages show up front only when they aren't a renewal
    // queued behind a running one (that patient is already listed).
    const upcoming = packages.filter((p) => p.state === 'upcoming' && !running.has(p.patient));
    return {
      today: [...current, ...upcoming],
      active: current,
      expiring: current.filter((p) => isExpiring(p, today) && !renewedPatients.has(p.patient)),
      expired: packages.filter((p) => p.state === 'expired' && !renewedPatients.has(p.patient)),
    };
  }, [packages, today, renewedPatients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = groups[tab].filter(
      (p) =>
        !q ||
        (p.patientName || '').toLowerCase().includes(q) ||
        (p.patientCode || '').toLowerCase().includes(q) ||
        (p.patientMobile || '').includes(q)
    );
    // Not-yet-arrived first so the desk works top-down, then by name.
    return [...list].sort(
      (a, b) => Number(a.markedToday) - Number(b.markedToday) || (a.patientName || '').localeCompare(b.patientName || '')
    );
  }, [groups, tab, query]);

  const presentToday = groups.active.filter((p) => p.markedToday).length;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'today', label: 'Active', count: groups.today.length },
    { key: 'expiring', label: 'Expiring soon', count: groups.expiring.length },
    { key: 'expired', label: 'Expired', count: groups.expired.length },
  ];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Attendance</h2>
          <p className="text-slate-500 text-sm">Monthly package patients · {formatDay(today)}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New package
            </button>
          )}
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium px-3 py-2 rounded-lg"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-reveal>
        <StatCard icon={<Users className="w-5 h-5" />} label="Active members" value={groups.active.length} tone="bg-sky-100 text-sky-700" />
        <StatCard icon={<UserCheck className="w-5 h-5" />} label="Present today" value={presentToday} tone="bg-emerald-100 text-emerald-700" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Expiring soon" value={groups.expiring.length} tone="bg-amber-100 text-amber-700" />
        <StatCard icon={<CalendarX className="w-5 h-5" />} label="Expired (renew)" value={groups.expired.length} tone="bg-rose-100 text-rose-700" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, patient ID or mobile…"
            className="w-full pl-9 pr-3 py-2 border border-slate-200 bg-white rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100" data-reveal>
        {loading ? (
          <p className="text-sm text-slate-400 px-4 py-10 text-center">Loading packages…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-400 px-4 py-10 text-center">
            {query
              ? 'No matching patients.'
              : tab === 'today'
              ? 'No active packages yet. Start one with "New package".'
              : tab === 'expiring'
              ? 'Nobody is close to the end of their package.'
              : 'No lapsed packages in the last 30 days.'}
          </p>
        ) : (
          visible.map((p) => {
            const left = sessionsLeft(p);
            const dLeft = daysLeft(p, today);
            const open = expanded === p.id;
            const pct = p.sessionsTotal > 0 ? Math.min(100, (p.sessionsUsed / p.sessionsTotal) * 100) : 0;
            const todayBusy = busy === `${p.id}:${today}`;
            return (
              <div key={p.id} className={p.markedToday ? 'bg-emerald-50/40' : ''}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpanded(open ? null : p.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    aria-expanded={open}
                  >
                    <span
                      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                        p.markedToday ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p.markedToday ? <Check className="w-5 h-5" /> : (p.patientName || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 truncate">{p.patientName}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </span>
                      <span className="block text-xs text-slate-500 truncate">
                        {p.patientCode}
                        {p.patientMobile ? ` · ${p.patientMobile}` : ''} · {p.name}
                      </span>
                      <span className="mt-1.5 flex items-center gap-2 text-xs">
                        {p.sessionsTotal > 0 && (
                          <span className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <span className={`block h-full ${left === 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                          </span>
                        )}
                        <span className="text-slate-600">{sessionsLabel(p)}</span>
                        <span className={p.state === 'expired' ? 'text-rose-600 font-medium' : dLeft <= 5 ? 'text-amber-600 font-medium' : 'text-slate-400'}>
                          {p.state === 'expired'
                            ? `ended ${formatDay(p.endDay)}`
                            : p.state === 'upcoming'
                            ? `until ${formatDay(p.endDay)}`
                            : `${dLeft} day${dLeft === 1 ? '' : 's'} left`}
                        </span>
                        {p.amountDue > 0 && p.state !== 'cancelled' && (
                          <span className="text-amber-700 font-medium">{formatMoney(p.amountDue)} due</span>
                        )}
                      </span>
                    </span>
                  </button>

                  {p.state === 'upcoming' ? (
                    <span className="shrink-0 text-xs font-medium text-sky-600">Starts {formatDay(p.startDay)}</span>
                  ) : p.state === 'expired' ? (
                    canManage && (
                      <button
                        onClick={() => setRenewing(p)}
                        className="shrink-0 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
                      >
                        <RefreshCw className="w-4 h-4" /> Renew
                      </button>
                    )
                  ) : p.markedToday ? (
                    <button
                      onClick={() => toggle(p, today, false)}
                      disabled={todayBusy}
                      className="shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-2.5 rounded-lg hover:bg-slate-100"
                      title="Undo today's mark"
                    >
                      <Undo2 className="w-4 h-4" /> Undo
                    </button>
                  ) : isExhausted(p) ? (
                    canManage ? (
                      <button
                        onClick={() => setRenewing(p)}
                        className="shrink-0 inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
                      >
                        <RefreshCw className="w-4 h-4" /> Renew
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-rose-600">Sessions used up</span>
                    )
                  ) : (
                    <button
                      onClick={() => toggle(p, today, true)}
                      disabled={todayBusy}
                      className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm"
                    >
                      <Check className="w-4 h-4" /> {todayBusy ? 'Marking…' : 'Mark present'}
                    </button>
                  )}
                </div>

                {open && (
                  <div className="px-4 pb-4 pt-1 flex flex-col sm:flex-row gap-6 border-t border-slate-100 bg-slate-50/60">
                    <div className="pt-3">
                      <AttendanceCalendar
                        pkg={p}
                        busyDay={busy?.startsWith(`${p.id}:`) ? busy.slice(p.id.length + 1) : null}
                        onToggleDay={(day, present) => toggle(p, day, present)}
                        allowOutside={canManage}
                      />
                      <p className="text-[11px] text-slate-400 mt-2 max-w-xs">
                        Tap a past day to fix a missed or wrong mark. Use the month picker to jump to older dates.
                      </p>
                    </div>
                    <div className="pt-3 text-sm space-y-1.5 text-slate-600">
                      <p>
                        <span className="text-slate-400">Period:</span> {formatDay(p.startDay)} – {formatDay(p.endDay)}
                      </p>
                      <p>
                        <span className="text-slate-400">Attended:</span> {sessionsLabel(p)}
                        {left !== null && ` · ${left} left`}
                      </p>
                      {p.paymentStatus !== 'free' && (
                        <p>
                          <span className="text-slate-400">Fee:</span> <PaymentBadge pkg={p} />
                        </p>
                      )}
                      {p.notes && (
                        <p>
                          <span className="text-slate-400">Notes:</span> {p.notes}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-2">
                        {profileBase && (
                          <button onClick={() => navigate(`${profileBase}/${p.patient}`)} className={secondaryBtn}>
                            <ExternalLink className="w-3.5 h-3.5" /> Profile
                          </button>
                        )}
                        {canManage && (
                          <>
                            {p.amountDue > 0 && (
                              <button
                                onClick={() => setCollecting(p)}
                                className={`${secondaryBtn} text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100`}
                              >
                                <IndianRupee className="w-3.5 h-3.5" /> Collect {formatMoney(p.amountDue)}
                              </button>
                            )}
                            <button onClick={() => setEditing(p)} className={secondaryBtn}>
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button onClick={() => setRenewing(p)} className={secondaryBtn}>
                              <RefreshCw className="w-3.5 h-3.5" /> Renew
                            </button>
                            <button onClick={() => cancel(p)} className={secondaryBtn}>
                              Cancel package
                            </button>
                            <button onClick={() => remove(p)} className={`${secondaryBtn} text-rose-600 hover:bg-rose-50`}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {(creating || renewing || editing) && (
        <PackageModal
          renewFrom={renewing}
          editPkg={editing}
          onClose={() => {
            setCreating(false);
            setRenewing(null);
            setEditing(null);
          }}
          onSaved={() => load()}
        />
      )}

      {collecting && (
        <RecordPaymentModal
          presetPatient={
            { id: collecting.patient, name: collecting.patientName, patientId: collecting.patientCode, mobile: collecting.patientMobile } as Patient
          }
          presetPackageId={collecting.id}
          onClose={() => setCollecting(null)}
          onRecorded={() => load()}
        />
      )}
    </div>
  );
}

const secondaryBtn =
  'inline-flex items-center gap-1 border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-medium px-2.5 py-1.5 rounded-md';

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg mb-3 ${tone}`}>{icon}</div>
      <p className="text-xl font-bold text-slate-900 leading-none">{value}</p>
      <p className="text-xs text-slate-500 mt-1">{label}</p>
    </div>
  );
}
