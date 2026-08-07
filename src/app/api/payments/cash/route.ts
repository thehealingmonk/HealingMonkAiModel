import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Payment } from '@/lib/server/models/Payment';
import { Patient } from '@/lib/server/models/Patient';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, paymentReceiptEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

// Manual desk billing: record a cash/card/UPI payment. Reception/admin.
const MANUAL_METHODS = ['cash', 'card', 'upi'];

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { patientId, amount, method, plan, notes } = (await req.json().catch(() => ({}))) || {};
    const paise = Math.round(Number(amount) * 100);
    if (!patientId || !paise || paise <= 0) {
      return NextResponse.json({ error: 'patientId and a positive amount are required' }, { status: 400 });
    }
    // Default to cash; only accept the desk-collectable methods (never 'online',
    // which is reserved for the Razorpay gateway flow).
    const payMethod = MANUAL_METHODS.includes(method) ? method : 'cash';
    const patient = await Patient.findById(patientId);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const payment = await Payment.create({
      patient: patient._id,
      amount: paise,
      currency: 'INR',
      method: payMethod,
      status: 'paid',
      plan: plan || '',
      notes: notes || '',
      collectedBy: user._id,
    });

    if (patient.email) {
      sendMail({
        to: patient.email,
        ...paymentReceiptEmail({
          patientName: patient.name,
          amount: paise,
          currency: 'INR',
          method: payMethod,
        }),
      });
    }
    return NextResponse.json({ payment: payment.toJSONSafe() }, { status: 201 });
  } catch (err) {
    console.error('cash payment error', err);
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 });
  }
}
