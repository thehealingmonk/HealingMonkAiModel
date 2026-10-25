import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Reports timeline for a patient (newest first).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) return NextResponse.json({ reports: [] });
  await connectDB();
  const reports = await Report.find({ patient: params.id })
    .populate('doctor', 'name')
    .sort({ createdAt: -1 });
  return NextResponse.json({ reports: reports.map((r: any) => r.toJSONSafe()) });
}
