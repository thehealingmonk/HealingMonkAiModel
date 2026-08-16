import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Get a single report. Any authenticated user.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await connectDB();
  const report = await Report.findById(params.id).populate('doctor', 'name');
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
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

  await connectDB();
  const report = await Report.findById(params.id);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

  await report.deleteOne();
  return NextResponse.json({ ok: true });
}
