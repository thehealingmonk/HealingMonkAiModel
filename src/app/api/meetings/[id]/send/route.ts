import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { OnlineMeeting } from '@/lib/server/models/OnlineMeeting';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, meetingInviteEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

// Pretty date string for emails, in IST (clinic timezone).
function formatWhen(date: Date | string) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Same access rule as the meeting detail route: admins can act on any meeting,
// a doctor only on meetings bound to them.
function staffCanAccess(user: any, meeting: any): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'doctor') {
    const docId = meeting.assignedDoctor?._id || meeting.assignedDoctor;
    return !!docId && docId.toString() === user._id.toString();
  }
  return false;
}

// (Re)send the meeting invite email to the patient with the secure room link and
// scheduled time. Optionally override the recipient via { to } in the body.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const meeting = await OnlineMeeting.findById(params.id)
      .populate('patient', 'name email')
      .populate('assignedDoctor', 'name');
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    if (!staffCanAccess(user, meeting)) {
      return NextResponse.json({ error: 'Forbidden: not your meeting' }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) || {};
    const to = (typeof body.to === 'string' && body.to.trim()) || meeting.patient?.email || '';
    if (!to) {
      return NextResponse.json(
        { error: 'No email on file for this patient. Add one or pass a recipient.' },
        { status: 400 }
      );
    }

    const base = process.env.APP_BASE_URL || '';
    if (!base) return NextResponse.json({ error: 'APP_BASE_URL is not configured.' }, { status: 500 });

    const mail = meetingInviteEmail({
      patientName: meeting.patient?.name || 'there',
      doctorName: meeting.assignedDoctor?.name,
      when: meeting.scheduledAt ? formatWhen(meeting.scheduledAt) : undefined,
      link: `${base}/m/${meeting.roomToken}`,
    });
    const { sent } = await sendMail({ to, ...mail });
    if (!sent) {
      return NextResponse.json({ error: 'Email could not be sent (SMTP not configured or send failed).' }, { status: 502 });
    }

    await OnlineMeeting.updateOne({ _id: meeting._id }, { $set: { inviteSentAt: new Date() } });
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    console.error('send meeting invite error', err);
    return NextResponse.json({ error: 'Could not send the meeting invite' }, { status: 500 });
  }
}
