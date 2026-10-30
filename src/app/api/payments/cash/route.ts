import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Payment } from '@/lib/server/models/Payment';
import { Patient } from '@/lib/server/models/Patient';
import { PatientPackage, paidByPackage } from '@/lib/server/packages';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, paymentReceiptEmail } from '@/lib/server/mailer';
import { istDay, isDay, atIstDay, formatDay } from '@/lib/packageDates';

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
    const { patientId, packageId, amount, method, plan, notes, paidOn } = (await req.json().catch(() => ({}))) || {};
    const paise = Math.round(Number(amount) * 100);
    if (!patientId || !paise || paise <= 0) {
      return NextResponse.json({ error: 'patientId and a positive amount are required' }, { status: 400 });
    }
    // Optional back-dating: the IST day the money was actually received. It
    // becomes the payment's createdAt, so Collections, analytics and dues all
    // count it on that day. Future days are rejected.
    const today = istDay();
    if (paidOn && !isDay(paidOn)) {
      return NextResponse.json({ error: 'Invalid payment date' }, { status: 400 });
    }
    if (paidOn && paidOn > today) {
      return NextResponse.json({ error: 'Payment date cannot be in the future' }, { status: 400 });
    }
    const backdated = Boolean(paidOn) && paidOn < today;
    // Default to cash; only accept the desk-collectable methods (never 'online',
    // which is reserved for the Razorpay gateway flow).
    const payMethod = MANUAL_METHODS.includes(method) ? method : 'cash';
    const patient = mongoose.isValidObjectId(patientId) ? await Patient.findById(patientId) : null;
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Optional: this payment is (part of) a monthly package fee. It must be the
    // same patient's package and must not take the package past its fee.
    let pkg: any = null;
    if (packageId) {
      pkg = mongoose.isValidObjectId(packageId) ? await PatientPackage.findById(packageId) : null;
      if (!pkg || pkg.patient.toString() !== patient._id.toString()) {
        return NextResponse.json({ error: 'Package not found for this patient' }, { status: 404 });
      }
      const due = Math.max(0, pkg.amount - ((await paidByPackage([pkg])).get(pkg._id.toString()) || 0));
      if (paise > due) {
        return NextResponse.json(
          { error: due > 0 ? `Only ₹${due / 100} is due on this package` : 'This package is already fully paid' },
          { status: 400 }
        );
      }
    }

    const payment = await Payment.create({
      patient: patient._id,
      package: pkg ? pkg._id : null,
      amount: paise,
      currency: 'INR',
      method: payMethod,
      status: 'paid',
      plan: plan || (pkg ? pkg.name : ''),
      notes: notes || '',
      collectedBy: user._id,
      ...(backdated ? { createdAt: atIstDay(paidOn) } : {}),
    });

    if (patient.email) {
      sendMail({
        to: patient.email,
        ...paymentReceiptEmail({
          patientName: patient.name,
          amount: paise,
          currency: 'INR',
          method: payMethod,
          ...(backdated ? { paidOn: formatDay(paidOn) } : {}),
        }),
      });
    }
    return NextResponse.json({ payment: payment.toJSONSafe() }, { status: 201 });
  } catch (err) {
    console.error('cash payment error', err);
    return NextResponse.json({ error: 'Could not record payment' }, { status: 500 });
  }
}
