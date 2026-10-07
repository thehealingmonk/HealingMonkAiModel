import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Payment } from '@/lib/server/models/Payment';
import { requireAuth } from '@/middleware/auth';
import { sendMail, paymentReceiptEmail } from '@/lib/server/mailer';
import { verifyPaymentSignature } from '@/lib/server/razorpay';

export const dynamic = 'force-dynamic';

// Verify a completed Razorpay checkout and mark the payment paid.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  try {
    await connectDB();
    const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
      (await req.json().catch(() => ({}))) || {};
    if (
      !mongoose.isValidObjectId(paymentId) ||
      typeof razorpayPaymentId !== 'string' ||
      typeof razorpaySignature !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid payment verification request' }, { status: 400 });
    }
    const payment = await Payment.findById(paymentId).populate('patient', 'name email');
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (payment.status === 'paid') return NextResponse.json({ payment: payment.toJSONSafe() });

    // The signature must be checked against THIS payment's own order id (stored
    // server-side when the order was created), never the client-supplied one —
    // otherwise a valid signature from a cheap order could mark a large bill paid.
    const ok =
      Boolean(payment.razorpayOrderId) &&
      (!razorpayOrderId || razorpayOrderId === payment.razorpayOrderId) &&
      verifyPaymentSignature({
        orderId: payment.razorpayOrderId,
        paymentId: razorpayPaymentId,
        signature: razorpaySignature,
      });
    if (!ok) {
      if (payment.status === 'created') {
        payment.status = 'failed';
        await payment.save();
      }
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 });
    }

    payment.status = 'paid';
    payment.razorpayPaymentId = razorpayPaymentId;
    await payment.save();

    if (payment.patient?.email) {
      sendMail({
        to: payment.patient.email,
        ...paymentReceiptEmail({
          patientName: payment.patient.name,
          amount: payment.amount,
          currency: payment.currency,
          method: 'online',
          reference: razorpayPaymentId,
        }),
      });
    }
    return NextResponse.json({ payment: payment.toJSONSafe() });
  } catch (err) {
    console.error('verify payment error', err);
    return NextResponse.json({ error: 'Could not verify payment' }, { status: 500 });
  }
}
