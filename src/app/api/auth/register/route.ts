import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { signToken } from '@/middleware/auth';
import { permissionsForRole } from '@/lib/server/permissions';
import { rateLimit, clientIp } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Open self-signup. The very first account ever created becomes the admin
// (bootstrap); everyone else who self-registers is a patient. Staff accounts
// (doctor/reception) are created by an admin via POST /api/users.
//
// A self-registered patient account is NOT linked to any clinic patient record:
// the email is unverified, so matching it to hm_patients would let anyone read
// another person's reports by signing up with their address. The link is made
// only when an admin provisions the login from the patient record
// (POST /api/patients/[id]/account), which sets `patientLinked`.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`register:${clientIp(req)}`, 5, 15 * 60_000);
  if (limited) return limited;

  try {
    await connectDB();
    const { name, email, password } = (await req.json().catch(() => ({}))) || {};
    if (
      typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' ||
      !name.trim() || !email || !password
    ) {
      return NextResponse.json({ error: 'name, email and password are required' }, { status: 400 });
    }
    const normalized = email.toLowerCase().trim();
    if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }
    if (password.length < 6 || password.length > 200) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const exists = await User.findOne({ email: normalized });
    if (exists) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

    const isFirstUser = (await User.estimatedDocumentCount()) === 0;
    const role = isFirstUser ? 'admin' : 'patient';

    const user = new User({ name: name.trim().slice(0, 120), email: normalized, role });
    await user.setPassword(password);
    await user.save();

    const token = signToken(user);
    return NextResponse.json(
      { token, user: user.toSafeJSON(), permissions: permissionsForRole(user.role) },
      { status: 201 }
    );
  } catch (err) {
    console.error('register error', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
