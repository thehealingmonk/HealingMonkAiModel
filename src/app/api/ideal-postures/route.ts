import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { IdealPosture } from '@/lib/server/models/IdealPosture';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Max characters for a single image data URL (~0.75 MB after base64 overhead).
// Keeps the library light so reports that bake these in stay small.
const MAX_IMAGE_CHARS = 1_000_000;
const MAX_IMAGES_PER_CONDITION = 8;

// List the ideal-posture library. Any authenticated staff member can read it
// (doctors curate, but reception/patient views may render the reference too).
// Optional ?conditions=Shoulder,Neck narrows to specific conditions.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await connectDB();
  const filter: Record<string, unknown> = {};
  const conditions = req.nextUrl.searchParams.get('conditions');
  if (conditions) {
    filter.condition = { $in: conditions.split(',').map((c) => c.trim()).filter(Boolean) };
  }
  const sets = await IdealPosture.find(filter).sort({ condition: 1 });
  return NextResponse.json({ sets: sets.map((s: any) => s.toJSONSafe()) });
}

// Upsert the image library for one condition. Doctors/admin only.
export async function PUT(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { condition, images } = (await req.json().catch(() => ({}))) || {};

    if (!condition || typeof condition !== 'string') {
      return NextResponse.json({ error: 'condition is required' }, { status: 400 });
    }
    if (!Array.isArray(images)) {
      return NextResponse.json({ error: 'images must be an array' }, { status: 400 });
    }
    if (images.length > MAX_IMAGES_PER_CONDITION) {
      return NextResponse.json(
        { error: `At most ${MAX_IMAGES_PER_CONDITION} images per condition` },
        { status: 400 }
      );
    }

    const clean: { label: string; imageData: string }[] = [];
    for (const img of images) {
      const data = img?.imageData;
      if (typeof data !== 'string' || !data.startsWith('data:image/')) {
        return NextResponse.json({ error: 'Each image needs a valid data URL' }, { status: 400 });
      }
      if (data.length > MAX_IMAGE_CHARS) {
        return NextResponse.json({ error: 'One image is too large (max ~0.7 MB)' }, { status: 400 });
      }
      clean.push({ label: typeof img.label === 'string' ? img.label.slice(0, 120) : '', imageData: data });
    }

    const set = await IdealPosture.findOneAndUpdate(
      { condition: condition.trim() },
      { condition: condition.trim(), images: clean, updatedBy: user._id },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ set: set.toJSONSafe() });
  } catch (err) {
    console.error('save ideal posture error', err);
    return NextResponse.json({ error: 'Could not save ideal postures' }, { status: 500 });
  }
}
