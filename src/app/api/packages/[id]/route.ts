import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { PatientPackage, Attendance, withUsage } from '@/lib/server/packages';
import { PACKAGE_STATUSES } from '@/lib/server/models/PatientPackage';
import { requireAuth, requireRole } from '@/middleware/auth';
import { isDay } from '@/lib/packageDates';

export const dynamic = 'force-dynamic';

// Edit a package — fix the name / sessions / fee (rupees), move the start or
// end date, cancel or re-activate it. Reception/admin.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const pkg = mongoose.isValidObjectId(params.id) ? await PatientPackage.findById(params.id) : null;
    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) || {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'Package name is required' }, { status: 400 });
      pkg.name = name;
    }
    if (body.sessionsTotal !== undefined) pkg.sessionsTotal = Math.max(0, Math.round(Number(body.sessionsTotal) || 0));
    if (body.startDay !== undefined || body.endDay !== undefined) {
      const startDay = body.startDay !== undefined ? body.startDay : pkg.startDay;
      const endDay = body.endDay !== undefined ? body.endDay : pkg.endDay;
      if (!isDay(startDay) || !isDay(endDay)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      if (endDay < startDay) {
        return NextResponse.json({ error: 'End date must be on or after the start date' }, { status: 400 });
      }
      // Shrinking the period must not leave attendance marks outside it (they
      // would still count as used sessions but be invisible on the calendar).
      const outside = await Attendance.countDocuments({
        package: pkg._id,
        $or: [{ day: { $lt: startDay } }, { day: { $gt: endDay } }],
      });
      if (outside > 0) {
        return NextResponse.json(
          { error: `${outside} attendance mark${outside === 1 ? '' : 's'} fall outside the new dates — remove them first.` },
          { status: 409 }
        );
      }
      pkg.startDay = startDay;
      pkg.endDay = endDay;
    }
    if (body.amount !== undefined) pkg.amount = Math.max(0, Math.round(Number(body.amount || 0) * 100));
    if (body.status !== undefined) {
      if (!PACKAGE_STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      pkg.status = body.status;
    }
    if (body.notes !== undefined) pkg.notes = String(body.notes || '');

    await pkg.save();
    await pkg.populate('patient', 'name patientId mobile');
    const [out] = await withUsage([pkg]);
    return NextResponse.json({ package: out });
  } catch (err) {
    console.error('update package error', err);
    return NextResponse.json({ error: 'Could not update package' }, { status: 500 });
  }
}

// Delete a mistaken package and its attendance. Any recorded payment is kept
// as billing history (remove it from Collections if it was also a mistake).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const pkg = mongoose.isValidObjectId(params.id) ? await PatientPackage.findByIdAndDelete(params.id) : null;
  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 });
  await Attendance.deleteMany({ package: pkg._id });
  return NextResponse.json({ ok: true, id: params.id });
}
