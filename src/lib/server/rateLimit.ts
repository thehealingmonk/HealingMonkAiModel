import { NextRequest, NextResponse } from 'next/server';

// Fixed-window, in-memory rate limiter for abuse-prone public endpoints (login,
// signup, public booking/report writes). It is per server instance — on a
// multi-instance deployment each instance keeps its own counters — which is
// still enough to blunt password guessing and scripted spam from one client.

interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  buckets.forEach((b, k) => {
    if (b.resetAt <= now) buckets.delete(k);
  });
}

/** Best-effort client IP from the proxy headers (falls back to a shared key). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || req.ip || 'unknown';
}

/**
 * Count one hit against `key`. Returns a ready-to-return 429 response once more
 * than `limit` hits happen inside `windowMs`, else null.
 */
export function rateLimit(key: string, limit: number, windowMs: number): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  b.count += 1;
  if (b.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }
  return null;
}
