import { NextRequest, NextResponse } from 'next/server';
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

    const sub = await Subscription.findById(subscriptionId);
    if (!sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

    const ok = verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });
    if (!ok) {
      sub.status = 'failed';
      await sub.save();
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
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
