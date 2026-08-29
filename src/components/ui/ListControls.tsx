// Reusable data-table controls for the admin/staff lists: a live count strip,
// a segmented pill filter, a search box and small date helpers. Dark-glass
// styling to match the dashboard tables.
import { Search, X } from 'lucide-react';
import CountUp from '@/components/ui/CountUp';

// YYYY-MM-DD in the clinic timezone (IST) — matches how the API buckets days.
export function istDay(value?: string | Date | null): string {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

export function isToday(value?: string | Date | null): boolean {
  return !!value && istDay(value) === istDay();
}

/** True when the date falls within the last `n` days (inclusive of today). */
export function isWithinDays(value: string | Date | null | undefined, n: number): boolean {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - (n - 1) * 86400000;
}

export type DateRange = 'today' | '7d' | '30d' | 'all';

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

export function inRange(value: string | Date | null | undefined, range: DateRange): boolean {
  switch (range) {
    case 'today':
      return isToday(value);
    case '7d':
      return isWithinDays(value, 7);
    case '30d':
      return isWithinDays(value, 30);
    default:
      return true;
  }
}

export interface StatItem {
  label: string;
  value: number;
  /** Optional formatter (e.g. money). Defaults to a live CountUp of the number. */
  format?: (n: number) => string;
  /** Tailwind text-color class for the value, e.g. 'text-emerald-300'. */
  tint?: string;
}

/** A compact strip of live totals shown above a table. */
export function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-reveal="fade">
      {items.map((s) => (
        <div key={s.label} className="glass-dark rounded-xl px-4 py-3">
          <p className={`text-2xl font-bold leading-none ${s.tint || 'text-white'}`}>
            {s.format ? <CountUp value={s.value} format={s.format} /> : <CountUp value={s.value} />}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional live count shown as a small badge on the pill. */
  count?: number;
}

/** A segmented pill toggle (single-select). */
export function SegmentedFilter<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-white/15 bg-white/5 p-0.5" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.value ? 'bg-emerald-500 text-white shadow shadow-emerald-500/30' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.label}
          {o.count !== undefined && (
            <span
              className={`rounded-full px-1.5 text-[10px] font-bold ${
                value === o.value ? 'bg-white/25 text-white' : 'bg-white/10 text-slate-300'
              }`}
            >
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A debounce-free controlled search box with a clear button. */
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-56 rounded-lg border border-white/15 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder-slate-500 focus:border-transparent focus:ring-2 focus:ring-emerald-400/60"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
