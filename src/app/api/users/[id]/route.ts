import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import mongoose from 'mongoose';
import { requireAuth, requireRole, invalidateUser, revokeSessions, signToken } from '@/middleware/auth';
import { ROLES, permissionsForRole } from '@/lib/server/permissions';

export const dynamic = 'force-dynamic';

// Admin edits a staff/patient account: any of name, email, role, or a password
// reset. Only the fields present in the body are touched. Admin-only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  await connectDB();
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { name, email, role, password } = (await req.json().catch(() => ({}))) || {};
  const isSelf = target._id.equals(user._id);
  // Sessions issued under the old role / password must stop working.
  let revoke = false;

  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: `role must be one of: ${ROLES.join(', ')}` }, { status: 400 });
    }
    // Don't let the last admin demote themselves out of the console by accident.
    if (isSelf && role !== 'admin') {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
    }
    if (target.role !== role) revoke = true;
    target.role = role;
  }

  if (name !== undefined) {
    if (!String(name).trim()) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    target.name = String(name).trim();
  }

  if (email !== undefined) {
    const normalized = String(email).toLowerCase().trim();
    if (!normalized) return NextResponse.json({ error: 'Email cannot be empty' }, { status: 400 });
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }
    const clash = await User.findOne({ email: normalized, _id: { $ne: target._id } });
    if (clash) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    target.email = normalized;
  }

  if (password !== undefined && password !== '') {
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    await target.setPassword(password);
    revoke = true;
  }

  if (revoke) revokeSessions(target);
  await target.save();
  // Role/email/password just changed — drop any cached copy so the next request
  // for this account re-reads the fresh record instead of a stale one.
  invalidateUser(params.id);
  return NextResponse.json({
    user: target.toSafeJSON(),
    permissions: permissionsForRole(target.role),
    // An admin who reset their OWN password gets a fresh token for this session.
    ...(revoke && isSelf ? { token: signToken(target) } : {}),
  });
}

// Admin permanently deletes a user account. Admin-only. You cannot delete
// yourself (prevents locking yourself out of the console).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  await connectDB();
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target._id.equals(user._id)) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  await target.deleteOne();
  invalidateUser(params.id);
  return NextResponse.json({ ok: true });
}
