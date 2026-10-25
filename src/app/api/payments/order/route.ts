import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Payment } from '@/lib/server/models/Payment';
import { Patient } from '@/lib/server/models/Patient';
import mongoose from 'mongoose';
import { requireAuth } from '@/middleware/auth';
import { myPatientIds } from '@/lib/server/patientLink';
import { razorpayEnabled, createOrder } from '@/lib/server/razorpay';

export const dynamic = 'force-dynamic';

// Create a Razorpay order for online payment. Any authenticated user (patient
// can pay their own bill; reception can initiate on a patient's behalf).
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  try {
    if (!razorpayEnabled) {
      return NextResponse.json({ error: 'Online payments are not configured' }, { status: 503 });
    }
    await connectDB();
    const { patientId, amount, plan } = (await req.json().catch(() => ({}))) || {};
    const paise = Math.round(Number(amount) * 100);
    if (!patientId || !paise || paise <= 0) {
      return NextResponse.json({ error: 'patientId and a positive amount are required' }, { status: 400 });
    }
    const patient = mongoose.isValidObjectId(patientId) ? await Patient.findById(patientId) : null;
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    // Staff may start a checkout for any patient; a patient login only for the
    // clinic record(s) linked to it. Without this, any signed-in account (even a
    // self-registered one) could attach payments to — and learn the name of —
    // any patient id.
    if (user.role === 'patient') {
      const mine = await myPatientIds(user);
      if (!mine.some((id: any) => id.toString() === patient._id.toString())) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
      }
    }

    const payment = await Payment.create({
      patient: patient._id,
      amount: paise,
      currency: 'INR',
      method: 'online',
      status: 'created',
      plan: plan || '',
      collectedBy: user._id,
    });

    const order = await createOrder({
      amount: paise,
      currency: 'INR',
      receipt: payment._id.toString(),
    });
    payment.razorpayOrderId = order.id;
    await payment.save();

    return NextResponse.json(
      {
        paymentId: payment._id.toString(),
        orderId: order.id,
        amount: paise,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID,
        patientName: patient.name,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('create order error', err);
    return NextResponse.json({ error: 'Could not create payment order' }, { status: 500 });
  }
}
