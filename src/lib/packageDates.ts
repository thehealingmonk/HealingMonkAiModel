// Calendar-day helpers for monthly packages & attendance. Days are plain
// "YYYY-MM-DD" strings in the clinic timezone (IST) so "today", a package's
// start/end and an attendance mark never drift across midnight UTC. Shared by
// the API routes and the UI.

const TZ = 'Asia/Kolkata';

/** The IST calendar day (YYYY-MM-DD) of a moment — defaults to now. */
export function istDay(at: Date = new Date()): string {
  return at.toLocaleDateString('en-CA', { timeZone: TZ });
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toUTC(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = toUTC(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Last day of an N-month package starting on `start` (13 Oct + 1 month → 12 Nov). */
export function packageEndDay(start: string, months: number): string {
  const d = toUTC(start);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp 31 Jan + 1 month to the end of February instead of rolling into March.
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfMonth));
  return addDays(d.toISOString().slice(0, 10), -1);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** Display a YYYY-MM-DD day, e.g. "13 Oct 2026". */
export function formatDay(day: string): string {
  if (!isDay(day)) return '—';
  return toUTC(day).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });
}
