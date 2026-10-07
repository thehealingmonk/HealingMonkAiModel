import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Subscription } from '@/lib/server/models/Subscription';
import { verifyPaymentSignature } from '@/lib/server/razorpay';
import { getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

// Public (no auth): verify a completed Razorpay checkout for a subscription and
// activate it. Returns the access expiry the client stores to unlock the flow.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { subscriptionId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      (await req.json().catch(() => ({}))) || {};

    if (
      !mongoose.isValidObjectId(subscriptionId) ||
      typeof razorpayPaymentId !== 'string' ||
      typeof razorpaySignature !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid subscription verification request' }, { status: 400 });
    }
    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    // Verify against the order created for THIS subscription (stored server-side),
    // so a signature from a cheaper plan's order can't activate a pricier plan.
    const ok =
      Boolean(sub.razorpayOrderId) &&
      (!razorpayOrderId || razorpayOrderId === sub.razorpayOrderId) &&
      verifyPaymentSignature({
        orderId: sub.razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      });
    if (!ok) {
      if (sub.status === 'created') {
        sub.status = 'failed';
        await sub.save();
      }
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    // Idempotent: re-verifying an already-active subscription returns its
    // original expiry instead of extending it.
    if (sub.status === 'active' && sub.expiresAt) {
      return NextResponse.json({
        subscription: sub.toJSONSafe(),
        expiresAt: new Date(sub.expiresAt).toISOString(),
        plan: sub.plan,
      });
    }

    const plan = getPlan(sub.plan);
    const durationDays = plan?.durationDays ?? 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    sub.status = 'active';
    sub.razorpayPaymentId = razorpayPaymentId;
    sub.expiresAt = expiresAt;
    await sub.save();

    return NextResponse.json({
      subscription: sub.toJSONSafe(),
      expiresAt: expiresAt.toISOString(),
      plan: sub.plan,
    });
  } catch (err) {
    console.error('verify subscription error', err);
    return NextResponse.json({ error: 'Could not verify subscription' }, { status: 500 });
  }
}
