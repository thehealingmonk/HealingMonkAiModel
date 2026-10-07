import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { requireAuth, requireRole } from '@/middleware/auth';
import { myPatientIds } from '@/lib/server/patientLink';

export const dynamic = 'force-dynamic';

// Get a single report. Clinical staff (admin/doctor) may open any report; a
// patient may open only a report that belongs to their own linked clinic
// record. Everyone else (reception, unlinked patients) is refused — reports are
// health data, so knowing an id must never be enough to read one.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'patient');
  if (roleErr) return roleErr;
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  await connectDB();
  const report = await Report.findById(params.id).populate('doctor', 'name');
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  if (user.role === 'patient') {
    const mine = await myPatientIds(user);
    const owns = mine.some((pid: any) => pid.toString() === report.patient?.toString());
    // 404 (not 403) so the response doesn't confirm the report exists.
    if (!owns) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
  return NextResponse.json({ report: report.toJSONSafe() });
}

// Admin permanently deletes an assessment report. Admin-only. (The linked
// public visual report in hm_public_reports is keyed separately by shareId and
// is left untouched.)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;
  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  await connectDB();
  const report = await Report.findById(params.id);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  await report.deleteOne();
  return NextResponse.json({ ok: true });
}
