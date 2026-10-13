import { PatientPackage } from '@/services/api';
import { daysBetween } from '@/lib/packageDates';

// Thresholds for the "expiring soon" nudge on the attendance desk.
export const EXPIRING_DAYS = 5;
export const EXPIRING_SESSIONS = 2;

/** Days left including today (0 once the package has ended). */
export function daysLeft(pkg: PatientPackage, today: string): number {
  return Math.max(0, daysBetween(today, pkg.endDay) + 1);
}

/** Sessions remaining, or null for an unlimited package. */
export function sessionsLeft(pkg: PatientPackage): number | null {
  return pkg.sessionsTotal > 0 ? Math.max(0, pkg.sessionsTotal - pkg.sessionsUsed) : null;
}

/** Active but close to running out of days or sessions — time to remind about renewal. */
export function isExpiring(pkg: PatientPackage, today: string): boolean {
  if (pkg.state !== 'active') return false;
  const left = sessionsLeft(pkg);
  return daysLeft(pkg, today) <= EXPIRING_DAYS || (left !== null && left <= EXPIRING_SESSIONS);
}

/** Every session in the package has been used up. */
export function isExhausted(pkg: PatientPackage): boolean {
  return sessionsLeft(pkg) === 0;
}

export function sessionsLabel(pkg: PatientPackage): string {
  return pkg.sessionsTotal > 0 ? `${pkg.sessionsUsed}/${pkg.sessionsTotal} sessions` : `${pkg.sessionsUsed} visits · unlimited`;
}
