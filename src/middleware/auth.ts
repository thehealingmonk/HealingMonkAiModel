import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { roleHasPermission, Role } from '@/lib/server/permissions';

export function signToken(user: any): string {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
  );
}

// Short-lived cache of authenticated user documents, keyed by user id.
//
// Every protected API request re-verifies the caller, and the app fires several
// in parallel per screen (e.g. opening a patient loads reports + appointments +
// payments at once). Without a cache each of those makes its OWN `User.findById`
// round-trip to Atlas purely to re-check the token owner — often the single
// biggest chunk of the "data loads slowly" latency, since it is serial with the
// actual data query. We memoise the resolved user for a few seconds (and dedupe
// concurrent lookups) so a burst of requests from one page shares one DB read.
//
// TTL is deliberately short so a deactivated/edited account still propagates
// quickly; `invalidateUser` clears it immediately on role/active/password change.
const USER_CACHE_TTL_MS = 15_000;
interface UserCacheEntry { user: any; expires: number }
const userCache = new Map<string, UserCacheEntry>();
const inFlight = new Map<string, Promise<any | null>>();

/** Drop a cached user so the next request re-reads them (call after edits). */
export function invalidateUser(userId: string) {
  userCache.delete(userId);
  inFlight.delete(userId);
}

async function loadUser(userId: string): Promise<any | null> {
  const cached = userCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.user;

  // Dedupe simultaneous lookups (the parallel-request burst) into one query.
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const promise = (async () => {
    await connectDB();
    const user = await User.findById(userId);
    const valid = user && user.active ? user : null;
    if (valid) userCache.set(userId, { user: valid, expires: Date.now() + USER_CACHE_TTL_MS });
    return valid;
  })().finally(() => inFlight.delete(userId));

  inFlight.set(userId, promise);
  return promise;
}

// Verify the Bearer token and return the live, active user document (or null).
export async function getUser(req: NextRequest): Promise<any | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { sub: string };
    return await loadUser(payload.sub);
  } catch {
    return null;
  }
}

type Guard = { user: any; error?: undefined } | { user?: undefined; error: NextResponse };

// Route-handler equivalent of the old Express requireAuth middleware: returns
// either the authenticated user or a ready-to-return 401 response.
export async function requireAuth(req: NextRequest): Promise<Guard> {
  const user = await getUser(req);
  if (!user) {
    return { error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  }
  return { user };
}

// Returns a 403 response if the user's role isn't allowed, else null.
export function requireRole(user: any, ...roles: Role[]): NextResponse | null {
  if (!roles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 });
  }
  return null;
}

// Returns a 403 response if the user lacks the permission, else null.
export function requirePermission(user: any, permission: string): NextResponse | null {
  if (!roleHasPermission(user.role, permission)) {
    return NextResponse.json({ error: `Forbidden: missing ${permission}` }, { status: 403 });
  }
  return null;
}
