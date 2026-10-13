import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { PatientPackage, withUsage } from '@/lib/server/packages';
import { requireAuth } from '@/middleware/auth';
import { myPatientIds } from '@/lib/server/patientLink';

export const dynamic = 'force-dynamic';

// GET /api/me/packages — the signed-in patient's monthly packages + attendance.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const ids = await myPatientIds(user);
    if (ids.length === 0) return NextResponse.json({ packages: [] });
    const pkgs = await PatientPackage.find({ patient: { $in: ids } }).sort({ startDay: -1 }).limit(24);
    return NextResponse.json({ packages: await withUsage(pkgs) });
  } catch (err) {
    console.error('me/packages error', err);
    return NextResponse.json({ error: 'Could not load your packages' }, { status: 500 });
  }
}
