import { PatientPackage } from '@/lib/server/models/PatientPackage';
import { Attendance } from '@/lib/server/models/Attendance';
import { Payment } from '@/lib/server/models/Payment';
import { istDay } from '@/lib/packageDates';

/**
 * Paise actually paid towards each package: every 'paid' payment linked to it
 * (instalments), plus the single bill older packages stored in `payment` before
 * payments carried a package link. Each payment is counted once.
 */
export async function paidByPackage(pkgs: any[]): Promise<Map<string, number>> {
  const paid = new Map<string, number>();
  if (!pkgs.length) return paid;
  const ids = pkgs.map((p) => p._id);
  const legacyIds = pkgs.filter((p) => p.payment).map((p) => p.payment._id || p.payment);
  const legacyOwner = new Map<string, string>(
    pkgs.filter((p) => p.payment).map((p) => [(p.payment._id || p.payment).toString(), p._id.toString()])
  );
  const rows = await Payment.find({
    status: 'paid',
    $or: [{ package: { $in: ids } }, ...(legacyIds.length ? [{ _id: { $in: legacyIds } }] : [])],
  })
    .select('package amount')
    .lean();
  for (const r of rows as any[]) {
    const key = r.package ? r.package.toString() : legacyOwner.get(r._id.toString());
    if (key) paid.set(key, (paid.get(key) || 0) + (r.amount || 0));
  }
  return paid;
}

/** 'paid' / 'partial' / 'unpaid', or 'free' when the package has no fee. */
export function paymentState(amount: number, amountPaid: number) {
  if (!amount) return 'free';
  if (amountPaid >= amount) return 'paid';
  return amountPaid > 0 ? 'partial' : 'unpaid';
}

/**
 * Serialise packages with their live usage: sessions attended, every attended
 * day (for the calendar), whether today is already marked, the derived state
 * (active / expired / cancelled) and the money side (paid so far, balance due).
 * One attendance query and one payments query for the whole set.
 */
export async function withUsage(pkgs: any[]) {
  const today = istDay();
  const ids = pkgs.map((p) => p._id);
  const [marks, paid] = await Promise.all([
    ids.length ? Attendance.find({ package: { $in: ids } }).select('package day').sort({ day: 1 }).lean() : [],
    paidByPackage(pkgs),
  ]);
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
    const amountPaid = paid.get(base.id) || 0;
    return {
      ...base,
      state,
      amountPaid,
      amountDue: Math.max(0, base.amount - amountPaid),
      paymentStatus: paymentState(base.amount, amountPaid),
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
