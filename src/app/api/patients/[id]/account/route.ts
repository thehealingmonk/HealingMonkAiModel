import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Patient } from '@/lib/server/models/Patient';
import { User } from '@/lib/server/models/User';
import mongoose from 'mongoose';
import { requireAuth, requireRole, invalidateUser, revokeSessions } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// GET: does this patient already have a login account? A patient User is linked
// to the clinic Patient record by shared email. Staff (admin/doctor/reception)
// may view the status; only admin can set/reset the password (POST below).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  }
  await connectDB();
  const patient = await Patient.findById(params.id);
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

  const email = (patient.email || '').toLowerCase();
  if (!email) return NextResponse.json({ hasAccount: false, email: '', active: false, staff: false });

  const account = await User.findOne({ email });
  const isStaff = account && account.role !== 'patient';
  return NextResponse.json({
    hasAccount: Boolean(account) && !isStaff,
    email,
    active: account ? account.active : false,
    staff: Boolean(isStaff),
  });
}

// POST: admin creates or resets the patient's login password. The login id is
// the patient's email. Creating an account here lets the patient sign in and see
// all their sessions and reports (matched by that email).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { password } = (await req.json().catch(() => ({}))) || {};
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const patient = mongoose.isValidObjectId(params.id) ? await Patient.findById(params.id) : null;
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const email = (patient.email || '').toLowerCase().trim();
    if (!email) {
      return NextResponse.json(
        { error: 'Add an email to this patient first — it becomes their login id.' },
        { status: 400 }
      );
    }

    let account = await User.findOne({ email });
    if (account && account.role !== 'patient') {
      return NextResponse.json(
        { error: 'This email already belongs to a staff account and cannot be used as a patient login.' },
        { status: 409 }
      );
    }

    const created = !account;
    if (!account) {
      account = new User({ name: patient.name, email, role: 'patient', createdBy: user._id });
    }
    await account.setPassword(password);
    // A password reset logs the patient out everywhere (e.g. a lost phone).
    if (!created) revokeSessions(account);
    account.active = true;
    // Staff-provisioned from the patient record → this login may see that
    // patient's clinic data (see lib/server/patientLink).
    account.patientLinked = true;
    await account.save();
    invalidateUser(account._id.toString());

    return NextResponse.json({ email, created }, { status: created ? 201 : 200 });
  } catch (err) {
    console.error('set patient account error', err);
    return NextResponse.json({ error: 'Could not set patient login' }, { status: 500 });
  }
}
