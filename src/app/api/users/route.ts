import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { requireAuth, requireRole } from '@/middleware/auth';
import { ROLES, permissionsForRole } from '@/lib/server/permissions';
import { sendMail, welcomeStaffEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

// List all users, optionally filtered by ?role=doctor. Admin-only.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  await connectDB();
  const role = req.nextUrl.searchParams.get('role');
  const filter: Record<string, unknown> = {};
  if (role && (ROLES as string[]).includes(role)) filter.role = role;
  const users = await User.find(filter).sort({ createdAt: -1 });
  return NextResponse.json({ users: users.map((u: any) => u.toSafeJSON()) });
}

// Admin creates a staff/user account (doctor, reception, or another admin).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { name, email, password, role } = (await req.json().catch(() => ({}))) || {};
    if (
      typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' ||
      !name.trim() || !email.trim() || !password || !role
    ) {
      return NextResponse.json(
        { error: 'name, email, password and role are required' },
        { status: 400 }
      );
    }
    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${ROLES.join(', ')}` }, { status: 400 });
    }
    if (password.length < 6 || password.length > 200) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    const normalized = email.toLowerCase().trim();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }
    const exists = await User.findOne({ email: normalized });
    if (exists) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

    const created = new User({ name: name.trim().slice(0, 120), email: normalized, role, createdBy: user._id });
    await created.setPassword(password);
    await created.save();

    // Notify the new staff member (non-blocking — never fails the request).
    const mail = welcomeStaffEmail({ name: created.name, email: normalized, role, tempPassword: password });
    sendMail({ to: normalized, ...mail });

    return NextResponse.json(
      { user: created.toSafeJSON(), permissions: permissionsForRole(created.role) },
      { status: 201 }
    );
  } catch (err) {
    console.error('create user error', err);
    return NextResponse.json({ error: 'Could not create user' }, { status: 500 });
  }
}
