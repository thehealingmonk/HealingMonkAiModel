import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { requireAuth } from '@/middleware/auth';
import { myPatientIds } from '@/lib/server/patientLink';

export const dynamic = 'force-dynamic';

// GET /api/me/reports — the signed-in patient's own assessment reports.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const ids = await myPatientIds(user);
    if (ids.length === 0) return NextResponse.json({ reports: [] });
    const reports = await Report.find({ patient: { $in: ids } })
      .populate('doctor', 'name')
      .sort({ createdAt: -1 });
    return NextResponse.json({ reports: reports.map((r: any) => r.toJSONSafe()) });
  } catch (err) {
    console.error('me/reports error', err);
    return NextResponse.json({ error: 'Could not load your reports' }, { status: 500 });
  }
}
