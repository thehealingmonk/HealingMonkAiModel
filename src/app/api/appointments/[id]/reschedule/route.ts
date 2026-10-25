import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Appointment } from '@/lib/server/models/Appointment';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, appointmentRescheduledEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

function formatWhen(date: Date | string) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Reschedule. Reception/admin (doctors may reschedule their own).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }
  await connectDB();
  const { scheduledAt } = (await req.json().catch(() => ({}))) || {};
  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 });
  }
  const appt = await Appointment.findById(params.id).populate('patient', 'name email');
  if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  if (user.role === 'doctor' && String(appt.doctor) !== String(user._id)) {
    return NextResponse.json({ error: 'You can only reschedule your own appointments' }, { status: 403 });
  }

  appt.scheduledAt = when;
  appt.status = 'scheduled';
  await appt.save();
  await appt.populate('doctor', 'name');

  if (appt.patient?.email) {
    const mail = appointmentRescheduledEmail({
      patientName: appt.patient.name,
      doctorName: appt.doctor?.name,
      when: formatWhen(when),
    });
    sendMail({ to: appt.patient.email, ...mail });
  }
  return NextResponse.json({ appointment: appt.toJSONSafe() });
}
