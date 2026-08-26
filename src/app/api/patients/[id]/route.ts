import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Patient } from '@/lib/server/models/Patient';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Patient detail.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const patient = await Patient.findById(params.id).populate('assignedDoctor', 'name');
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  return NextResponse.json({ patient: patient.toJSONSafe() });
}

// Modify a patient — fix a wrong entry. Reception/doctor/admin may all correct
// intake details. Only the fields present in the body are touched; the clinic
// patientId and assigned doctor are left alone (doctor is changed via /assign).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const patient = await Patient.findById(params.id);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) || {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return NextResponse.json({ error: 'Patient name is required' }, { status: 400 });
      patient.name = name;
    }
    if (body.age !== undefined) patient.age = body.age === '' || body.age === null ? undefined : Number(body.age);
    if (body.gender !== undefined) patient.gender = body.gender || '';
    if (body.mobile !== undefined) patient.mobile = body.mobile || '';
    if (body.email !== undefined) patient.email = body.email || '';
    if (body.painAreas !== undefined) patient.painAreas = Array.isArray(body.painAreas) ? body.painAreas : [];
    if (body.complaint !== undefined) patient.complaint = body.complaint || '';
    if (body.height !== undefined) patient.height = body.height === '' || body.height === null ? null : Number(body.height);
    if (body.weight !== undefined) patient.weight = body.weight === '' || body.weight === null ? null : Number(body.weight);

    await patient.save();
    await patient.populate('assignedDoctor', 'name');
    return NextResponse.json({ patient: patient.toJSONSafe() });
  } catch (err) {
    console.error('update patient error', err);
    return NextResponse.json({ error: 'Could not update patient' }, { status: 500 });
  }
}

// Delete a patient — remove a duplicate/double entry. Reception/doctor/admin may
// all remove a mistaken record. Only the patient document is removed here; its
// reports/appointments/payments (if any) are matched separately and are left as
// history. Duplicates caught right after intake normally have none.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const patient = await Patient.findByIdAndDelete(params.id);
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: params.id });
}
