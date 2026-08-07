import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { Patient } from '@/lib/server/models/Patient';
import { Report } from '@/lib/server/models/Report';
import { Appointment } from '@/lib/server/models/Appointment';
import { Payment } from '@/lib/server/models/Payment';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

const TZ = 'Asia/Kolkata';

// Group-by-day helper: buckets docs into YYYY-MM-DD (clinic timezone) days.
function byDay(dateField: string, extra: Record<string, unknown> = {}) {
  return [
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: TZ } },
        ...extra,
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 as const } },
  ];
}

/**
 * Clinic analytics for the admin dashboard charts: daily revenue, daily new
 * patients, daily reports, appointment-status mix and the busiest doctors, all
 * over the last `?days` (default 30). Admin-only. Days are bucketed in IST so
 * they line up with the clinic's calendar.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30));
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [revenueByDay, patientsByDay, reportsByDay, apptByStatus, revenueTotal, topDoctorsAgg, methodAgg] =
      await Promise.all([
        Payment.aggregate([
          { $match: { status: 'paid', createdAt: { $gte: start } } },
          ...byDay('createdAt', { total: { $sum: '$amount' } }),
        ]),
        Patient.aggregate([{ $match: { createdAt: { $gte: start } } }, ...byDay('createdAt')]),
        Report.aggregate([{ $match: { createdAt: { $gte: start } } }, ...byDay('createdAt')]),
        Appointment.aggregate([
          { $match: { scheduledAt: { $gte: start } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Payment.aggregate([
          { $match: { status: 'paid', createdAt: { $gte: start } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        // Busiest doctors by reports created in range; names resolved below.
        Report.aggregate([
          { $match: { createdAt: { $gte: start }, doctor: { $ne: null } } },
          { $group: { _id: '$doctor', reports: { $sum: 1 } } },
          { $sort: { reports: -1 } },
          { $limit: 5 },
        ]),
        // Payment-method mix in range (cash / card / upi / online gateway).
        Payment.aggregate([
          { $match: { status: 'paid', createdAt: { $gte: start } } },
          { $group: { _id: '$method', total: { $sum: '$amount' } } },
        ]),
      ]);

    // Resolve doctor names (avoids relying on a $lookup collection name).
    const docIds = topDoctorsAgg.map((d: any) => d._id).filter(Boolean);
    const docs = docIds.length ? await User.find({ _id: { $in: docIds } }).select('name') : [];
    const nameById = new Map(docs.map((d: any) => [d._id.toString(), d.name]));
    const topDoctors = topDoctorsAgg.map((d: any) => ({
      name: nameById.get(d._id?.toString()) || 'Unknown',
      reports: d.reports,
    }));

    const apptStatus: Record<string, number> = {};
    apptByStatus.forEach((a: any) => {
      apptStatus[a._id] = a.count;
    });

    const paymentMethods: Record<string, number> = {};
    methodAgg.forEach((m: any) => {
      if (m._id) paymentMethods[m._id] = m.total;
    });

    return NextResponse.json({
      analytics: {
        days,
        revenueByDay: revenueByDay.map((d: any) => ({ date: d._id, total: d.total, count: d.count })),
        patientsByDay: patientsByDay.map((d: any) => ({ date: d._id, count: d.count })),
        reportsByDay: reportsByDay.map((d: any) => ({ date: d._id, count: d.count })),
        apptStatus,
        paymentMethods,
        topDoctors,
        revenueTotal: revenueTotal[0]?.total || 0,
        revenueCount: revenueTotal[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error('admin analytics error', err);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
