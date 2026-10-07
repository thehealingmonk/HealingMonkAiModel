import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Payment } from '@/lib/server/models/Payment';
import { requireAuth } from '@/middleware/auth';
import { myPatientIds } from '@/lib/server/patientLink';

export const dynamic = 'force-dynamic';

// GET /api/me/payments — the signed-in patient's own receipts + a paid total.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const ids = await myPatientIds(user);
    if (ids.length === 0) return NextResponse.json({ payments: [], totalPaid: 0 });

    const payments = await Payment.find({ patient: { $in: ids } }).sort({ createdAt: -1 });
    const totalPaid = payments
      .filter((p: any) => p.status === 'paid')
      .reduce((sum: number, p: any) => sum + p.amount, 0);

    return NextResponse.json({
      payments: payments.map((p: any) => p.toJSONSafe()),
      totalPaid,
    });
  } catch (err) {
    console.error('me/payments error', err);
    return NextResponse.json({ error: 'Could not load your payments' }, { status: 500 });
  }
}
