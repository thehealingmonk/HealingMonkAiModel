import { Users, FileText, CalendarDays, IndianRupee, Stethoscope, ClipboardList, ArrowRight, TrendingUp } from 'lucide-react';
import { getAdminStats } from '@/services/api';
import { formatMoney } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import CountUp from '@/components/ui/CountUp';
import AdminAnalytics from '@/features/admin/AdminAnalytics';

interface Props {
  /** Navigate to a section (patients / reports / appointments / payments / users). */
  onNavigate: (path: string) => void;
}

export default function AdminDashboard({ onNavigate }: Props) {
  const { data, refreshing, error, lastUpdated, refresh } = useLiveData(() => getAdminStats());
  const stats = data?.stats ?? null;

  const cards = [
    { key: 'patients', label: 'Patients', value: stats?.patients ?? 0, icon: Users, ring: 'from-emerald-400 to-teal-500', tint: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20', path: '/admin/patients' },
    { key: 'reports', label: 'Reports', value: stats?.reports ?? 0, icon: FileText, ring: 'from-violet-400 to-purple-500', tint: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-400/20', path: '/admin/reports' },
    { key: 'appointments', label: 'Appointments', value: stats?.appointments ?? 0, icon: CalendarDays, ring: 'from-sky-400 to-blue-500', tint: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20', path: '/admin/appointments' },
    { key: 'revenue', label: 'Revenue collected', value: stats?.revenuePaise ?? 0, icon: IndianRupee, ring: 'from-amber-400 to-orange-500', tint: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20', path: '/admin/payments', isMoney: true },
  ];

  const staff = [
    { key: 'doctors', title: 'Doctors', desc: 'Assessments · Notes', icon: Stethoscope, tint: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20', count: stats?.usersByRole.doctor, path: '/admin/users?role=doctor' },
    { key: 'reception', title: 'Reception', desc: 'Booking · Payments', icon: ClipboardList, tint: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20', count: stats?.usersByRole.reception, path: '/admin/users?role=reception' },
    { key: 'patients', title: 'Patient accounts', desc: 'Login · Reports', icon: Users, tint: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20', count: stats?.usersByRole.patient, path: '/admin/users?role=patient' },
  ];

  return (
    <div className="hm-page-enter mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Clinic Overview</h2>
          <p className="text-sm text-slate-400">Every patient, report, appointment and payment across your HealingMonk clinic.</p>
        </div>
        <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200" data-reveal="fade">{error}</div>
      )}

      {/* Live totals */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => onNavigate(c.path)}
              data-reveal="zoom"
              style={{ '--reveal-delay': `${i * 70}ms` } as React.CSSProperties}
              className="glass-dark glass-dark-lift group relative overflow-hidden rounded-2xl p-5 text-left"
            >
              <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${c.ring} opacity-20 transition-opacity group-hover:opacity-30`} />
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.tint}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className={`mt-3 font-bold text-white ${c.isMoney ? 'text-2xl' : 'text-3xl'}`}>
                {stats ? <CountUp value={c.value} format={c.isMoney ? (n) => formatMoney(n) : undefined} /> : '—'}
              </p>
              <p className="text-sm text-slate-400">{c.label}</p>
            </button>
          );
        })}
      </div>

      {/* Charts: revenue / patients / reports trends, appointment mix, top doctors */}
      <AdminAnalytics />

      {/* Staff modules */}
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-400" data-reveal="fade">
        <TrendingUp className="h-4 w-4 text-emerald-400" /> Team
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {staff.map((m, i) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => onNavigate(m.path)}
              data-reveal
              style={{ '--reveal-delay': `${i * 80}ms` } as React.CSSProperties}
              className="glass-dark glass-dark-lift group rounded-2xl p-5 text-left"
            >
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${m.tint}`}>
                  <Icon className="h-6 w-6" />
                </div>
                {m.count !== undefined && (
                  <span className="text-2xl font-bold text-white"><CountUp value={m.count} /></span>
                )}
              </div>
              <h4 className="mt-4 text-lg font-semibold text-white">{m.title}</h4>
              <p className="mt-1 text-sm text-slate-400">{m.desc}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-300">
                Manage <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
