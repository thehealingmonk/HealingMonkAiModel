import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { CustomPosition } from '@/lib/server/models/CustomPosition';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Delete a custom reference position. Doctors/admin only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  await connectDB();
  const position = await CustomPosition.findByIdAndDelete(params.id);
  if (!position) return NextResponse.json({ error: 'Position not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: params.id });
}
