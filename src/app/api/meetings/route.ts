import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { connectDB } from '@/lib/server/db';
import { OnlineMeeting } from '@/lib/server/models/OnlineMeeting';
import { Patient } from '@/lib/server/models/Patient';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// How long a meeting link stays valid after creation.
const MEETING_TTL_DAYS = 7;

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
  if (patientId) filter.patient = patientId;

  const meetings = await OnlineMeeting.find(filter)
    .populate('patient', 'name patientId')
    .populate('assignedDoctor', 'name')
    .sort({ createdAt: -1 })
    .limit(200);

  return NextResponse.json({ meetings: meetings.map((m: any) => m.toStaffJSON()) });
}

// Create a meeting for a patient. S-Admin only (per the flow: S-Admin → Patient
// → Create Meeting). The meeting is automatically bound to the patient's
// assigned doctor, so it appears for that doctor without them creating anything.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { patientId } = (await req.json().catch(() => ({}))) || {};
    if (!patientId) return NextResponse.json({ error: 'patientId is required' }, { status: 400 });

    const patient = await Patient.findById(patientId);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Unguessable room secret — the link carries THIS, never the _id, so no
    // patient can reach another patient's room by editing the URL.
    const roomToken = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + MEETING_TTL_DAYS * 24 * 60 * 60 * 1000);

    const meeting = new OnlineMeeting({
      roomToken,
      patient: patient._id,
      assignedDoctor: patient.assignedDoctor || null,
      createdBy: user._id,
      status: 'created',
      expiresAt,
    });
    await meeting.save();
    await meeting.populate('patient', 'name patientId');
    await meeting.populate('assignedDoctor', 'name');

    return NextResponse.json({ meeting: meeting.toStaffJSON() }, { status: 201 });
  } catch (err) {
    console.error('create meeting error', err);
    return NextResponse.json({ error: 'Could not create meeting' }, { status: 500 });
  }
}
