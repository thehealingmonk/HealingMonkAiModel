import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { OnlineMeeting } from '@/lib/server/models/OnlineMeeting';
import { requireAuth, requireRole } from '@/middleware/auth';
import { createMeetingFor } from '@/lib/server/meetings';

export const dynamic = 'force-dynamic';

// List online meetings, scoped by role:
//   admin   → all meetings (optionally ?patient=<id>)
//   doctor  → only meetings for patients assigned to them
// Newest first. Used by the admin console and the doctor's "Online Meetings".
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor');
  if (roleErr) return roleErr;

  await connectDB();
  const filter: Record<string, unknown> = {};
  // A doctor may ONLY ever see meetings bound to them — Doctor B never sees
  // Doctor A's patient's meeting.
  if (user.role === 'doctor') filter.assignedDoctor = user._id;

  const patientId = req.nextUrl.searchParams.get('patient');
  if (patientId) {
    if (!mongoose.isValidObjectId(patientId)) return NextResponse.json({ meetings: [] });
    filter.patient = patientId;
  }

  const meetings = await OnlineMeeting.find(filter)
    .populate('patient', 'name patientId')
    .populate('assignedDoctor', 'name')
    .sort({ createdAt: -1 })
    .limit(200);

  return NextResponse.json({ meetings: meetings.map((m: any) => m.toStaffJSON()) });
}

// Create a meeting for a patient. Admin or doctor. An admin binds it to the
// patient's assigned doctor; a doctor binds it to themselves so it shows in
// their own "Online Meetings".
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const body = (await req.json().catch(() => ({}))) || {};

    // Bulk mode: { meetings: [{ patientId, scheduledAt?, sendEmail? }, ...] }.
    // Each row is created + invited independently; failures are reported per row
    // rather than failing the whole batch, so scheduling many patients at once
    // never loses the ones that succeeded.
    if (Array.isArray(body.meetings)) {
      const rows = body.meetings as Array<{ patientId?: string; scheduledAt?: string; sendEmail?: boolean }>;
      if (rows.length === 0) return NextResponse.json({ error: 'No meetings to create' }, { status: 400 });
      if (rows.length > 100) return NextResponse.json({ error: 'Too many meetings in one batch (max 100)' }, { status: 400 });

      const created: any[] = [];
      const failed: Array<{ patientId?: string; error: string }> = [];
      for (const r of rows) {
        if (!r?.patientId) {
          failed.push({ patientId: r?.patientId, error: 'patientId is required' });
          continue;
        }
        const res = await createMeetingFor({ id: user._id, role: user.role }, r.patientId, {
          scheduledAt: r.scheduledAt ?? null,
          sendEmail: r.sendEmail,
        });
        if (res.error || !res.meeting) failed.push({ patientId: r.patientId, error: res.error || 'Could not create' });
        else created.push(res.meeting.toStaffJSON());
      }
      return NextResponse.json({ meetings: created, failed }, { status: 201 });
    }

    // Single mode: { patientId, scheduledAt?, sendEmail? }.
    const { patientId, scheduledAt, sendEmail } = body;
    if (!patientId) return NextResponse.json({ error: 'patientId is required' }, { status: 400 });

    const res = await createMeetingFor({ id: user._id, role: user.role }, patientId, { scheduledAt, sendEmail });
    if (res.error || !res.meeting) {
      return NextResponse.json({ error: res.error || 'Could not create meeting' }, { status: 404 });
    }
    return NextResponse.json({ meeting: res.meeting.toStaffJSON() }, { status: 201 });
  } catch (err) {
    console.error('create meeting error', err);
    return NextResponse.json({ error: 'Could not create meeting' }, { status: 500 });
  }
}
