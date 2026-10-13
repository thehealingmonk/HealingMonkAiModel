import { PatientPackage } from '@/lib/server/models/PatientPackage';
import { Attendance } from '@/lib/server/models/Attendance';
import { istDay } from '@/lib/packageDates';

/**
 * Serialise packages with their live usage: sessions attended, every attended
 * day (for the calendar), whether today is already marked, and the derived
 * state (active / expired / cancelled). One attendance query for the whole set.
 */
export async function withUsage(pkgs: any[]) {
  const today = istDay();
  const ids = pkgs.map((p) => p._id);
  const marks = ids.length
    ? await Attendance.find({ package: { $in: ids } }).select('package day').sort({ day: 1 }).lean()
    : [];
  const daysByPkg = new Map<string, string[]>();
  for (const m of marks as any[]) {
    const key = m.package.toString();
    if (!daysByPkg.has(key)) daysByPkg.set(key, []);
    daysByPkg.get(key)!.push(m.day);
  }

  return pkgs.map((p) => {
    const base = p.toJSONSafe();
    const days = daysByPkg.get(base.id) || [];
    const state =
      p.status === 'cancelled' ? 'cancelled' : today > p.endDay ? 'expired' : today < p.startDay ? 'upcoming' : 'active';
    return {
      ...base,
      state,
      attendedDays: days,
      sessionsUsed: days.length,
      markedToday: days.includes(today),
      patientName: p.patient?.name ?? undefined,
      patientCode: p.patient?.patientId ?? undefined,
      patientMobile: p.patient?.mobile ?? undefined,
    };
  });
}

export { PatientPackage, Attendance };
