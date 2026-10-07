import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { PublicReport } from '@/lib/server/models/PublicReport';
import { getUser } from '@/middleware/auth';
import { rateLimit, clientIp } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

// Reports carry several JPEG snapshots; MongoDB caps a document at 16 MB.
const MAX_BODY_BYTES = 14 * 1024 * 1024;
const REPORT_ID_RE = /^[a-z0-9][a-z0-9_-]{2,99}$/;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

function keyMatches(key: string | null, hash: string | null | undefined): boolean {
  if (!key || !hash) return false;
  const a = Buffer.from(sha256(key));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Create or update a public (guest) report. Body is the whole StoredReport blob,
// including its `id`, so the report URL works across browsers and devices.
//
// • Creating a new id is open (the paid guest flow has no login). The creator
//   sends a random `x-report-key`; only its hash is stored.
// • Updating an existing id requires that same key, or a signed-in clinical
//   staff member (admin/doctor) — e.g. a doctor editing from their panel.
export async function POST(req: NextRequest) {
  const limited = rateLimit(`public-report:${clientIp(req)}`, 120, 60_000);
  if (limited) return limited;

  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Report is too large to save.' }, { status: 413 });
  }

  try {
    const report = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
      return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
    }
    const reportId = report.id;
    if (typeof reportId !== 'string' || !REPORT_ID_RE.test(reportId)) {
      return NextResponse.json({ error: 'Report id is required' }, { status: 400 });
    }
    const key = req.headers.get('x-report-key');

    await connectDB();
    const existing = await PublicReport.findOne({ reportId }).select('+editKeyHash');

    if (!existing) {
      try {
        await PublicReport.create({
          reportId,
          data: report,
          editKeyHash: key && key.length >= 16 ? sha256(key) : null,
        });
      } catch (err: any) {
        // A concurrent create already claimed this id — refuse rather than overwrite.
        if (err?.code !== 11000) throw err;
        return NextResponse.json({ error: 'Report already exists' }, { status: 409 });
      }
      return NextResponse.json({ ok: true, id: reportId }, { status: 201 });
    }

    let allowed = keyMatches(key, existing.editKeyHash);
    if (!allowed) {
      const user = await getUser(req).catch(() => null);
      allowed = Boolean(user && (user.role === 'admin' || user.role === 'doctor'));
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'This report can only be edited from the device that created it or by clinic staff.' },
        { status: 403 }
      );
    }

    existing.data = report;
    existing.markModified('data');
    await existing.save();
    return NextResponse.json({ ok: true, id: reportId });
  } catch (err) {
    console.error('public report save error', err);
    return NextResponse.json({ error: 'Could not save the report.' }, { status: 500 });
  }
}
