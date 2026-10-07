import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Appointment } from '@/lib/server/models/Appointment';
import { requireAuth } from '@/middleware/auth';
import { myPatientIds } from '@/lib/server/patientLink';

export const dynamic = 'force-dynamic';

// GET /api/me/appointments — the signed-in patient's upcoming appointments.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const ids = await myPatientIds(user);
    if (ids.length === 0) return NextResponse.json({ appointments: [] });
    const appts = await Appointment.find({ patient: { $in: ids } })
      .populate('doctor', 'name')
      .populate('patient', 'name')
      .sort({ scheduledAt: -1 })
      .limit(50);
    return NextResponse.json({ appointments: appts.map((a: any) => a.toJSONSafe()) });
  } catch (err) {
    console.error('me/appointments error', err);
    return NextResponse.json({ error: 'Could not load your appointments' }, { status: 500 });
  }
}
