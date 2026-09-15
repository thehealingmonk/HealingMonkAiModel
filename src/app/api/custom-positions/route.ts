import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { CustomPosition } from '@/lib/server/models/CustomPosition';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Max characters for a single image data URL (~0.75 MB after base64 overhead).
const MAX_IMAGE_CHARS = 1_000_000;

// List custom reference positions. Any authenticated staff member can read them
// (they render in the Select Positions dictionary). Optional ?category=Shoulder.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await connectDB();
  const filter: Record<string, unknown> = {};
  const category = req.nextUrl.searchParams.get('category');
  if (category) filter.category = category;

  const positions = await CustomPosition.find(filter).sort({ category: 1, createdAt: -1 }).limit(500);
  return NextResponse.json({ positions: positions.map((p: any) => p.toJSONSafe()) });
}

// Add a custom reference position to a category. Doctors/admin only.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { category, name, imageData } = (await req.json().catch(() => ({}))) || {};

    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'category is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'A valid image is required' }, { status: 400 });
    }
    if (imageData.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: 'Image is too large (max ~0.7 MB)' }, { status: 400 });
    }

    const position = await CustomPosition.create({
      category: category.trim(),
      name: name.trim().slice(0, 120),
      imageData,
      createdBy: user._id,
    });
    return NextResponse.json({ position: position.toJSONSafe() }, { status: 201 });
  } catch (err) {
    console.error('create custom position error', err);
    return NextResponse.json({ error: 'Could not save the position' }, { status: 500 });
  }
}
