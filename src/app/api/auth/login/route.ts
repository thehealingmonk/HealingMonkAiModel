import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { User } from '@/lib/server/models/User';
import { signToken } from '@/middleware/auth';
import { permissionsForRole } from '@/lib/server/permissions';
import { rateLimit, clientIp } from '@/lib/server/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Brute-force protection: cap attempts per client IP.
  const limited = rateLimit(`login:${clientIp(req)}`, 10, 5 * 60_000);
  if (limited) return limited;

  try {
    await connectDB();
    const { email, password } = (await req.json().catch(() => ({}))) || {};
    // Strings only — an object here (e.g. {"$gt": ""}) must never reach a query.
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }
    const normalized = email.toLowerCase().trim();
    // Also cap attempts per targeted account, regardless of source IP.
    const perAccount = rateLimit(`login-acct:${normalized}`, 20, 15 * 60_000);
    if (perAccount) return perAccount;

    const user = await User.findOne({ email: normalized });
    if (!user || !(await user.verifyPassword(password))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    if (!user.active) return NextResponse.json({ error: 'Account disabled' }, { status: 403 });

    const token = signToken(user);
    return NextResponse.json({
      token,
      user: user.toSafeJSON(),
      permissions: permissionsForRole(user.role),
    });
  } catch (err) {
    console.error('login error', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
