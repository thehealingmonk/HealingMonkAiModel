import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { PatientPackage, Attendance, withUsage } from '@/lib/server/packages';
import { requireAuth, requireRole } from '@/middleware/auth';
import { istDay, isDay } from '@/lib/packageDates';

export const dynamic = 'force-dynamic';

async function loadPackage(id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  return PatientPackage.findById(id).populate('patient', 'name patientId mobile');
}

async function respond(pkg: any) {
  const [out] = await withUsage([pkg]);
  return NextResponse.json({ package: out });
}

// Mark the patient present — today by default, or a missed past `day` within
// the package period. Idempotent. Any staff member at the clinic can mark.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const pkg = await loadPackage(params.id);
    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) || {};
    const today = istDay();
    const day = body.day ? String(body.day) : today;
    if (!isDay(day)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    if (day > today) return NextResponse.json({ error: 'Cannot mark attendance for a future date' }, { status: 400 });
    if (pkg.status === 'cancelled') return NextResponse.json({ error: 'This package is cancelled' }, { status: 409 });
    if (day < pkg.startDay || day > pkg.endDay) {
      return NextResponse.json(
        { error: `Date is outside the package period (${pkg.startDay} to ${pkg.endDay}). Renew the package first.` },
        { status: 409 }
      );
    }

    const already = await Attendance.exists({ package: pkg._id, day });
    if (!already) {
      if (pkg.sessionsTotal > 0) {
        const used = await Attendance.countDocuments({ package: pkg._id });
        if (used >= pkg.sessionsTotal) {
          return NextResponse.json(
            { error: `All ${pkg.sessionsTotal} sessions are used. Renew or add sessions to continue.` },
            { status: 409 }
          );
        }
      }
      try {
        await Attendance.create({ package: pkg._id, patient: pkg.patient._id, day, markedBy: user._id });
      } catch (err: any) {
        if (err?.code !== 11000) throw err; // concurrent double tap — already marked
      }
    }
    return respond(pkg);
  } catch (err) {
    console.error('mark attendance error', err);
    return NextResponse.json({ error: 'Could not mark attendance' }, { status: 500 });
  }
}

// Undo a mark (wrong patient / wrong day): DELETE ?day=YYYY-MM-DD (default today).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const pkg = await loadPackage(params.id);
    if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    const day = req.nextUrl.searchParams.get('day') || istDay();
    if (!isDay(day)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    await Attendance.deleteOne({ package: pkg._id, day });
    return respond(pkg);
  } catch (err) {
    console.error('unmark attendance error', err);
    return NextResponse.json({ error: 'Could not update attendance' }, { status: 500 });
  }
}
