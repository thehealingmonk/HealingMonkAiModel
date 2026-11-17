import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { Patient } from '@/lib/server/models/Patient';
import { Report } from '@/lib/server/models/Report';
import { Appointment } from '@/lib/server/models/Appointment';
import { Payment } from '@/lib/server/models/Payment';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Aggregate counts for the super-admin overview. Admin-only.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const [patients, reports, appointments, usersByRole, paidAgg, apptByStatus, onlineNew] = await Promise.all([
      Patient.countDocuments(),
      Report.countDocuments(),
      Appointment.countDocuments(),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      // Website bookings still waiting for a doctor (the "new leads" inbox).
      Appointment.countDocuments({ source: 'online', status: 'scheduled', doctor: null }),
    ]);

    const roleCounts: Record<string, number> = { admin: 0, doctor: 0, reception: 0, patient: 0 };
    usersByRole.forEach((u: any) => {
      if (u._id in roleCounts) roleCounts[u._id] = u.count;
    });

    const apptStatus: Record<string, number> = {};
    apptByStatus.forEach((a: any) => {
      apptStatus[a._id] = a.count;
    });

    return NextResponse.json({
      stats: {
        patients,
        reports,
        appointments,
        usersByRole: roleCounts,
        apptStatus,
        revenuePaise: paidAgg[0]?.total || 0,
        paidCount: paidAgg[0]?.count || 0,
        onlineNew,
      },
    });
  } catch (err) {
    console.error('admin stats error', err);
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 });
  }
}
