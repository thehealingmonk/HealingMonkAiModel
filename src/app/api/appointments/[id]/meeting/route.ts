import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Appointment } from '@/lib/server/models/Appointment';
import { OnlineMeeting } from '@/lib/server/models/OnlineMeeting';
import { requireAuth, requireRole } from '@/middleware/auth';
import { createMeetingFor } from '@/lib/server/meetings';

export const dynamic = 'force-dynamic';

// Meeting statuses that still have a usable room.
const LIVE = ['created', 'waiting', 'active', 'ai_active'];

// Start the online (video) consultation for an appointment: creates a secure
// meeting room for the patient, bound to the appointment's doctor, scheduled at
// the appointment time, and emails the patient the invite link. Idempotent — if
// the appointment already has a live meeting, that one is returned.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }
  try {
    await connectDB();
    const { sendEmail } = (await req.json().catch(() => ({}))) || {};
    const appt = await Appointment.findById(params.id);
    if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    if (user.role === 'doctor' && appt.doctor?.toString() !== user._id.toString()) {
      return NextResponse.json({ error: 'This appointment is not assigned to you' }, { status: 403 });
    }
    if (appt.status === 'cancelled') {
      return NextResponse.json({ error: 'This appointment is cancelled' }, { status: 400 });
    }

    if (appt.meeting) {
      const existing = await OnlineMeeting.findById(appt.meeting);
      const notExpired = !existing?.expiresAt || existing.expiresAt.getTime() > Date.now();
      if (existing && LIVE.includes(existing.status) && notExpired) {
        await existing.populate('patient', 'name patientId');
        await existing.populate('assignedDoctor', 'name');
        return NextResponse.json({ meeting: existing.toStaffJSON(), reused: true });
      }
    }

    const res = await createMeetingFor({ id: user._id, role: user.role }, appt.patient.toString(), {
      scheduledAt: appt.scheduledAt,
      sendEmail: sendEmail !== false,
      doctorId: appt.doctor ? appt.doctor.toString() : null,
    });
    if (res.error || !res.meeting) {
      return NextResponse.json({ error: res.error || 'Could not create meeting' }, { status: 400 });
    }
    appt.meeting = res.meeting._id;
    appt.mode = 'video';
    await appt.save();
    return NextResponse.json({ meeting: res.meeting.toStaffJSON(), reused: false }, { status: 201 });
  } catch (err) {
    console.error('appointment meeting error', err);
    return NextResponse.json({ error: 'Could not create meeting' }, { status: 500 });
  }
}
