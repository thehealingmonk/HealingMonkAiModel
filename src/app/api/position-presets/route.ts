import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { DoctorPositionPreset } from '@/lib/server/models/DoctorPositionPreset';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Keep only unique, non-empty pose-id strings.
function cleanPoses(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((p): p is string => typeof p === 'string' && p.trim() !== '')));
}

// Get a doctor's default-positions preset. A doctor reads their own; an admin may
// read any doctor's via ?doctor=<id>. Returns null when none is saved yet.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  await connectDB();
  const docId = user.role === 'admin' ? req.nextUrl.searchParams.get('doctor') || user._id : user._id;
  const preset = await DoctorPositionPreset.findOne({ doctor: docId });
  return NextResponse.json({ preset: preset ? preset.toJSONSafe() : null });
}

// Upsert the calling doctor's preset. Doctors only (each manages their own).
export async function PUT(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const body = (await req.json().catch(() => ({}))) || {};
    // Admins may save on behalf of a specific doctor; doctors save their own.
    const docId = user.role === 'admin' && body.doctor ? body.doctor : user._id;

    const defaultPoses = cleanPoses(body.defaultPoses);
    const byCondition = Array.isArray(body.byCondition)
      ? body.byCondition
          .filter((c: any) => c && typeof c.condition === 'string' && c.condition.trim())
          .map((c: any) => ({ condition: c.condition.trim(), poses: cleanPoses(c.poses) }))
      : [];

    const preset = await DoctorPositionPreset.findOneAndUpdate(
      { doctor: docId },
      { doctor: docId, defaultPoses, byCondition },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ preset: preset.toJSONSafe() });
  } catch (err) {
    console.error('save position preset error', err);
    return NextResponse.json({ error: 'Could not save your default positions' }, { status: 500 });
  }
}
