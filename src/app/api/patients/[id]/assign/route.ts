import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Patient } from '@/lib/server/models/Patient';
import { User } from '@/lib/server/models/User';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Assign (or reassign) a doctor to a patient.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }
  await connectDB();
  const { doctorId } = (await req.json().catch(() => ({}))) || {};
  const patient = await Patient.findById(params.id);
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

  if (doctorId) {
    const doctor = mongoose.isValidObjectId(doctorId) ? await User.findById(doctorId) : null;
    if (!doctor || doctor.role !== 'doctor') {
      return NextResponse.json({ error: 'doctorId must reference a doctor account' }, { status: 400 });
    }
    patient.assignedDoctor = doctor._id;
  } else {
    patient.assignedDoctor = null;
  }
  await patient.save();
  await patient.populate('assignedDoctor', 'name');
  return NextResponse.json({ patient: patient.toJSONSafe() });
}
