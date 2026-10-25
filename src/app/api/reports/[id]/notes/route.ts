import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Add / update the doctor's notes on a report. Doctors/admin only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
  await connectDB();
  const { doctorNotes } = (await req.json().catch(() => ({}))) || {};
  const report = await Report.findById(params.id);
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  report.doctorNotes = typeof doctorNotes === 'string' ? doctorNotes.slice(0, 20_000) : '';
  await report.save();
  await report.populate('doctor', 'name');
  return NextResponse.json({ report: report.toJSONSafe() });
}
