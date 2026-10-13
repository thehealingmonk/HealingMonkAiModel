import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PatientPackage } from '@/services/api';
import { istDay } from '@/lib/packageDates';

interface Props {
  pkg: PatientPackage;
  /** When set, past days inside the package period can be tapped to toggle presence. */
  onToggleDay?: (day: string, present: boolean) => void;
  busyDay?: string | null;
  dark?: boolean;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function monthKey(day: string) {
  return day.slice(0, 7); // YYYY-MM
}

function shiftMonth(key: string, n: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

// Month grid of a package: green = attended, outlined = inside the package
// period, faded = outside it. Opens on the current month (or the package's
// last month once it has ended) and pages only across the package period.
export default function AttendanceCalendar({ pkg, onToggleDay, busyDay, dark = false }: Props) {
  const today = istDay();
  const first = monthKey(pkg.startDay);
  const last = monthKey(pkg.endDay);
  const initial = today < pkg.startDay ? first : today > pkg.endDay ? last : monthKey(today);
  const [month, setMonth] = useState(initial);
  const attended = useMemo(() => new Set(pkg.attendedDays), [pkg.attendedDays]);

  const [y, m] = month.split('-').map(Number);
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const navBtn = dark
    ? 'p-1 rounded-md text-slate-300 hover:bg-white/10 disabled:opacity-30'
    : 'p-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30';

  return (
    <div className="w-full max-w-xs">
      <div className="flex items-center justify-between mb-2">
        <button type="button" className={navBtn} disabled={month <= first} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-800'}`}>{label}</span>
        <button type="button" className={navBtn} disabled={month >= last} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className={`text-[10px] font-medium ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const inRange = day >= pkg.startDay && day <= pkg.endDay;
          const present = attended.has(day);
          const editable = !!onToggleDay && inRange && day <= today && pkg.status !== 'cancelled';
          let cls = dark ? 'text-slate-600' : 'text-slate-300';
          if (present) cls = 'bg-emerald-500 text-white font-semibold';
          else if (inRange) cls = dark ? 'text-slate-200 ring-1 ring-inset ring-white/15' : 'text-slate-700 ring-1 ring-inset ring-slate-200';
          const isToday = day === today;
          return (
            <button
              key={day}
              type="button"
              disabled={!editable || busyDay === day}
              onClick={() => onToggleDay?.(day, !present)}
              title={present ? 'Present' : inRange ? (editable ? 'Tap to mark present' : '') : 'Outside package'}
              className={`h-8 rounded-md text-xs transition-colors ${cls} ${isToday ? 'outline outline-2 outline-sky-500' : ''} ${
                editable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              } ${busyDay === day ? 'animate-pulse' : ''}`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
