import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { requireAuth, requireRole } from '@/middleware/auth';
import { ROLES, permissionsForRole } from '@/lib/server/permissions';

export const dynamic = 'force-dynamic';

// Admin edits a staff/patient account: any of name, email, role, or a password
// reset. Only the fields present in the body are touched. Admin-only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  await connectDB();
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { name, email, role, password } = (await req.json().catch(() => ({}))) || {};
  const isSelf = target._id.equals(user._id);

  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${ROLES.join(', ')}` }, { status: 400 });
    }
    // Don't let the last admin demote themselves out of the console by accident.
    if (isSelf && role !== 'admin') {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
    }
    target.role = role;
  }

  if (name !== undefined) {
    if (!String(name).trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    target.name = String(name).trim();
  }

  if (email !== undefined) {
    const normalized = String(email).toLowerCase().trim();
    if (!normalized) return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 });
    const clash = await User.findOne({ email: normalized, _id: { $ne: target._id } });
    if (clash) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    target.email = normalized;
  }

  if (password !== undefined && password !== '') {
    if (String(password).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    await target.setPassword(password);
  }

  await target.save();
  return NextResponse.json({
    user: target.toSafeJSON(),
    permissions: permissionsForRole(target.role),
  });
}

// Admin permanently deletes a user account. Admin-only. You cannot delete
// yourself (prevents locking yourself out of the console).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  await connectDB();
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target._id.equals(user._id)) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  await target.deleteOne();
  return NextResponse.json({ ok: true });
}
