import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { requireAuth, requireRole, invalidateUser } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Enable / disable an account. Admin-only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin');
  if (roleErr) return roleErr;

  await connectDB();
  const { active } = (await req.json().catch(() => ({}))) || {};
  const target = await User.findById(params.id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target._id.equals(user._id)) {
    return NextResponse.json({ error: 'You cannot change your own status' }, { status: 400 });
  }
  target.active = Boolean(active);
  await target.save();
  // A disabled account must stop being accepted right away, not after the TTL.
  invalidateUser(params.id);
  return NextResponse.json({ user: target.toSafeJSON() });
}
