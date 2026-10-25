import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import mongoose from 'mongoose';
import { requireAuth, requireRole, invalidateUser, revokeSessions } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Enable / disable an account. Admin-only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  if (!mongoose.isValidObjectId(params.id)) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  await connectDB();
  const { active } = (await req.json().catch(() => ({}))) || {};
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target._id.equals(user._id)) {
    return NextResponse.json({ error: 'You cannot change your own status' }, { status: 400 });
  }
  const next = Boolean(active);
  // Disabling revokes existing tokens, so re-enabling later does NOT silently
  // revive sessions that were open when the account was switched off.
  if (target.active && !next) revokeSessions(target);
  target.active = next;
  await target.save();
  // A disabled account must stop being accepted right away, not after the TTL.
  invalidateUser(params.id);
  return NextResponse.json({ user: target.toSafeJSON() });
}
