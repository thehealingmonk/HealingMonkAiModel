import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Appointment } from '@/lib/server/models/Appointment';
import { Patient } from '@/lib/server/models/Patient';
import { User } from '@/lib/server/models/User';
import '@/lib/server/models/OnlineMeeting';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Assign (or clear) the doctor for one appointment — used to route an online
// booking "lead" to a doctor. If the patient has no doctor yet, they become that
// doctor's patient too, so the lead shows in the doctor's console.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
  }
  try {
    await connectDB();
    const { doctorId } = (await req.json().catch(() => ({}))) || {};
    const appt = await Appointment.findById(params.id);
    if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });

    if (doctorId) {
      const doctor = mongoose.isValidObjectId(doctorId) ? await User.findById(doctorId) : null;
      if (!doctor || doctor.role !== 'doctor') {
        return NextResponse.json({ error: 'doctorId must reference a doctor account' }, { status: 400 });
      }
      appt.doctor = doctor._id;
      const patient = await Patient.findById(appt.patient);
      if (patient && !patient.assignedDoctor) {
        patient.assignedDoctor = doctor._id;
        await patient.save();
      }
    } else {
      appt.doctor = null;
    }
    await appt.save();
    await appt.populate('patient', 'name');
    await appt.populate('doctor', 'name');
    await appt.populate('meeting', 'roomToken status');
    return NextResponse.json({ appointment: appt.toJSONSafe() });
  } catch (err) {
    console.error('assign appointment error', err);
    return NextResponse.json({ error: 'Could not assign doctor' }, { status: 500 });
  }
}
