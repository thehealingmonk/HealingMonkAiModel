import { useEffect, useState } from 'react';
import { BarChart3, IndianRupee, Users, FileText, Stethoscope } from 'lucide-react';
import { AppointmentStatus, DayPoint, getAdminAnalytics } from '@/services/api';
import { formatMoney } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import ExportButton from '@/components/ui/ExportButton';
import { LineAreaChart, BarChart, HBars, ChartPoint } from '@/components/ui/Charts';

const RANGES = [7, 30, 90] as const;

const STATUS_COLOR: Record<string, string> = {
  scheduled: '#0ea5e9',
  completed: '#10b981',
  cancelled: '#94a3b8',
  no_show: '#ef4444',
};

const METHOD_COLOR: Record<string, string> = {
  cash: '#f59e0b',
  upi: '#8b5cf6',
  card: '#0ea5e9',
  online: '#10b981',
};

// YYYY-MM-DD in the clinic timezone (matches how the API buckets days).
function istDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}
function lastNDays(n: number): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) out.push(istDay(new Date(now - i * 86400000)));
  return out;
}
// "12 Aug" style short label for tooltips.
function shortLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

interface DayRow {
  date: string;
  revenue: number; // INR
  patients: number;
  reports: number;
}

export default function AdminAnalytics() {
  const [days, setDays] = useState<number>(30);
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() => getAdminAnalytics(days));
  // Re-fetch immediately when the range changes (poll uses the latest closure).
  useEffect(() => {
    refresh();
  }, [days, refresh]);

  const a = data?.analytics;

  // Fill missing days so trends are continuous (gaps show as zero).
  const daysArr = lastNDays(days);
  const mapBy = (series?: DayPoint[]) => new Map((series ?? []).map((p) => [p.date, p]));
  const revMap = mapBy(a?.revenueByDay);
  const patMap = mapBy(a?.patientsByDay);
  const repMap = mapBy(a?.reportsByDay);

  const revenuePoints: ChartPoint[] = daysArr.map((d) => ({ label: shortLabel(d), value: (revMap.get(d)?.total ?? 0) / 100 }));
  const patientPoints: ChartPoint[] = daysArr.map((d) => ({ label: shortLabel(d), value: patMap.get(d)?.count ?? 0 }));
  const reportPoints: ChartPoint[] = daysArr.map((d) => ({ label: shortLabel(d), value: repMap.get(d)?.count ?? 0 }));

  const statusRows = (Object.entries(a?.apptStatus ?? {}) as [AppointmentStatus, number][])
    .sort((x, y) => y[1] - x[1])
    .map(([label, value]) => ({ label: label.replace('_', ' '), value, color: STATUS_COLOR[label] }));

  const doctorRows = (a?.topDoctors ?? []).map((d) => ({ label: d.name, value: d.reports, color: '#8b5cf6' }));

  const methodRows = (Object.entries(a?.paymentMethods ?? {}) as [string, number][])
    .sort((x, y) => y[1] - x[1])
    .map(([label, paise]) => ({
      label: label === 'online' ? 'Online gateway' : label.toUpperCase(),
      value: paise / 100,
      color: METHOD_COLOR[label] || '#64748b',
    }));

  // Merged daily rows for the CSV "download report".
  const exportRows: DayRow[] = daysArr.map((d) => ({
    date: d,
    revenue: (revMap.get(d)?.total ?? 0) / 100,
    patients: patMap.get(d)?.count ?? 0,
    reports: repMap.get(d)?.count ?? 0,
  }));
  const exportColumns = [
    { header: 'Date', value: (r: DayRow) => r.date },
    { header: 'Revenue (INR)', value: (r: DayRow) => r.revenue.toFixed(2) },
    { header: 'New patients', value: (r: DayRow) => r.patients },
    { header: 'Reports', value: (r: DayRow) => r.reports },
  ];

  return (
    <section className="mb-8" data-reveal="fade">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <BarChart3 className="h-4 w-4 text-emerald-500" /> Analytics · last {days} days
        </h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  days === r ? 'bg-emerald-500 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <ExportButton filename={`analytics-${days}d`} columns={exportColumns} rows={exportRows} label="Download report" />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Range totals */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MiniStat icon={<IndianRupee className="h-4 w-4" />} tint="bg-amber-50 text-amber-600" label="Revenue" value={formatMoney(a?.revenueTotal ?? 0)} />
        <MiniStat icon={<FileText className="h-4 w-4" />} tint="bg-violet-50 text-violet-600" label="Payments" value={String(a?.revenueCount ?? 0)} />
        <MiniStat icon={<Users className="h-4 w-4" />} tint="bg-emerald-50 text-emerald-600" label="New patients" value={String(patientPoints.reduce((s, p) => s + p.value, 0))} />
        <MiniStat icon={<Stethoscope className="h-4 w-4" />} tint="bg-sky-50 text-sky-600" label="Reports" value={String(reportPoints.reduce((s, p) => s + p.value, 0))} />
      </div>

      {loading && !a ? (
        <div className="h-56 rounded-2xl border border-slate-200 bg-white animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Revenue trend" subtitle="Daily collections">
            <LineAreaChart id="rev" points={revenuePoints} color="#f59e0b" format={(n) => formatMoney(n * 100)} />
          </ChartCard>
          <ChartCard title="New patients" subtitle="Registrations per day">
            <BarChart points={patientPoints} color="#10b981" />
          </ChartCard>
          <ChartCard title="Reports created" subtitle="AI assessments per day">
            <BarChart points={reportPoints} color="#8b5cf6" />
          </ChartCard>
          <ChartCard title="Appointments" subtitle="Status mix in range">
            <div className="pt-2">
              <HBars rows={statusRows} />
            </div>
          </ChartCard>
          <ChartCard title="Payment methods" subtitle="Collections by method">
            <div className="pt-2">
              {methodRows.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No payments in range.</p>
              ) : (
                <HBars rows={methodRows} format={(n) => formatMoney(n * 100)} />
              )}
            </div>
          </ChartCard>
          <ChartCard title="Busiest doctors" subtitle="By reports created" className="lg:col-span-2">
            <div className="pt-2">
              <HBars rows={doctorRows} format={(n) => `${n} report${n === 1 ? '' : 's'}`} />
            </div>
          </ChartCard>
        </div>
      )}
    </section>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-3">
        <h4 className="font-semibold text-slate-900">{title}</h4>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${tint}`}>{icon}</div>
      <p className="mt-2 text-lg font-bold leading-none text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}
