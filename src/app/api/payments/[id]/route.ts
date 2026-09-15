import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Payment, PAYMENT_STATUSES } from '@/lib/server/models/Payment';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Methods reception can set on a manually-recorded bill (never the online gateway).
const MANUAL_METHODS = ['cash', 'card', 'upi'];

// Edit a payment — correct a wrong amount / method / service / notes / status.
// Reception & admin. Amount comes in as rupees and is stored as paise.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const payment = await Payment.findById(params.id);
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) || {};

    if (body.amount !== undefined) {
      const paise = Math.round(Number(body.amount) * 100);
      if (!paise || paise <= 0) {
        return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
      }
      payment.amount = paise;
    }
    if (body.method !== undefined) {
      if (!MANUAL_METHODS.includes(body.method)) {
        return NextResponse.json({ error: 'method must be cash, card or upi' }, { status: 400 });
      }
      payment.method = body.method;
    }
    if (body.status !== undefined) {
      if (!PAYMENT_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'invalid status' }, { status: 400 });
      }
      payment.status = body.status;
    }
    if (body.plan !== undefined) payment.plan = String(body.plan || '');
    if (body.notes !== undefined) payment.notes = String(body.notes || '');

    await payment.save();
    return NextResponse.json({ payment: payment.toJSONSafe() });
  } catch (err) {
    console.error('update payment error', err);
    return NextResponse.json({ error: 'Could not update payment' }, { status: 500 });
  }
}

// Delete a payment — remove a mistaken/duplicate bill. Reception & admin.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const payment = await Payment.findByIdAndDelete(params.id);
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  return NextResponse.json({ ok: true, id: params.id });
}
