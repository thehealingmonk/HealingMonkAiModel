import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { PublicReport } from '@/lib/server/models/PublicReport';

export const dynamic = 'force-dynamic';

// Fetch a stored public report by id.
// The URL is the read credential, so the response is personal health data:
// never store it in shared caches and never let it be indexed.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[a-z0-9][a-z0-9_-]{2,99}$/.test(params.id)) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404, headers: PRIVATE_HEADERS });
  }
  try {
    await connectDB();
    const doc = await PublicReport.findOne({ reportId: params.id });
    if (!doc) return NextResponse.json({ error: 'Report not found' }, { status: 404, headers: PRIVATE_HEADERS });
    return NextResponse.json(doc.data, { headers: PRIVATE_HEADERS });
  } catch (err) {
    console.error('public report fetch error', err);
    return NextResponse.json({ error: 'Could not load the report.' }, { status: 500 });
  }
}
