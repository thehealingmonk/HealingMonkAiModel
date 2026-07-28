import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Subscription } from '@/lib/server/models/Subscription';
import { razorpayEnabled, createOrder } from '@/lib/server/razorpay';
import { getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

// Public (no auth): create a Razorpay order for an AI-assessment subscription.
// The plan id is validated server-side and the price is taken from the server's
// plan table — the client never dictates the amount.
export async function POST(req: NextRequest) {
  try {
    if (!razorpayEnabled) {
      return NextResponse.json({ error: 'Online payments are not configured' }, { status: 503 });
    }
    const { planId, email } = (await req.json().catch(() => ({}))) || {};
    const plan = getPlan(String(planId || ''));
    if (!plan) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
    }
    const paise = Math.round(plan.priceINR * 100);

    await connectDB();
    const sub = await Subscription.create({
      plan: plan.id,
      amount: paise,
      currency: 'INR',
      status: 'created',
      email: (email || '').trim(),
    });

    const order = await createOrder({
      amount: paise,
      currency: 'INR',
      receipt: sub._id.toString(),
    });
    sub.razorpayOrderId = order.id;
    await sub.save();

    return NextResponse.json(
      {
        subscriptionId: sub._id.toString(),
        orderId: order.id,
        amount: paise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        planName: plan.name,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('create subscription order error', err);
    return NextResponse.json({ error: err.message || 'Could not create subscription order' }, { status: 500 });
  }
}
