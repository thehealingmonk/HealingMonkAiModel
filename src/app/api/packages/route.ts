import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Patient } from '@/lib/server/models/Patient';
import { Payment } from '@/lib/server/models/Payment';
import { PatientPackage, withUsage } from '@/lib/server/packages';
import { requireAuth, requireRole } from '@/middleware/auth';
import { istDay, isDay, addDays, packageEndDay } from '@/lib/packageDates';

export const dynamic = 'force-dynamic';

const MANUAL_METHODS = ['cash', 'card', 'upi'];
// Expired packages stay on the attendance desk this long so they can be renewed.
const RECENTLY_EXPIRED_DAYS = 30;

// List monthly packages with live attendance usage. Staff only.
//   ?patient=<id> → every package of that patient (newest first)
//   otherwise     → the desk view: active, upcoming and recently-expired packages
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const patient = req.nextUrl.searchParams.get('patient');
    const filter: Record<string, unknown> = {};
    if (patient) {
      if (!mongoose.isValidObjectId(patient)) return NextResponse.json({ packages: [], today: istDay() });
      filter.patient = patient;
    } else {
      filter.status = 'active';
      // Also keep packages touched recently even when their dates are old (an
      // old client's history being back-filled) so the desk can still edit them.
      filter.$or = [
        { endDay: { $gte: addDays(istDay(), -RECENTLY_EXPIRED_DAYS) } },
        { updatedAt: { $gte: new Date(Date.now() - RECENTLY_EXPIRED_DAYS * 86_400_000) } },
      ];
    }
    const pkgs = await PatientPackage.find(filter)
      .sort({ startDay: -1 })
      .limit(500)
      .populate('patient', 'name patientId mobile');
    return NextResponse.json({ packages: await withUsage(pkgs), today: istDay() });
  } catch (err) {
    console.error('list packages error', err);
    return NextResponse.json({ error: 'Could not load packages' }, { status: 500 });
  }
}

// Enrol a patient in a monthly package (also used for renewals). Optionally
// records the package fee as a paid desk payment. Reception/admin.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const body = (await req.json().catch(() => ({}))) || {};
    const name = String(body.name || '').trim();
    const months = Math.round(Number(body.months) || 1);
    const sessionsTotal = Math.max(0, Math.round(Number(body.sessionsTotal) || 0));
    const startDay = body.startDay ? String(body.startDay) : istDay();
    const paise = Math.max(0, Math.round(Number(body.amount || 0) * 100));
    // Paid now — the full fee unless the client is paying part of it (the rest
    // stays as a balance due on the package and is collected later).
    const paidPaise =
      body.paidAmount === undefined || body.paidAmount === ''
        ? paise
        : Math.max(0, Math.round(Number(body.paidAmount || 0) * 100));

    if (!body.patientId || !name) {
      return NextResponse.json({ error: 'Patient and package name are required' }, { status: 400 });
    }
    if (!isDay(startDay)) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    if (months < 1 || months > 12) {
      return NextResponse.json({ error: 'Duration must be 1–12 months' }, { status: 400 });
    }
    if (paidPaise > paise) {
      return NextResponse.json({ error: 'Amount paid cannot be more than the package fee' }, { status: 400 });
    }
    const patient = mongoose.isValidObjectId(body.patientId) ? await Patient.findById(body.patientId) : null;
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const pkg = await PatientPackage.create({
      patient: patient._id,
      name,
      sessionsTotal,
      startDay,
      endDay: packageEndDay(startDay, months),
      amount: paise,
      notes: String(body.notes || '').trim(),
      createdBy: user._id,
    });

    if (paidPaise > 0 && MANUAL_METHODS.includes(body.method)) {
      const payment = await Payment.create({
        patient: patient._id,
        package: pkg._id,
        amount: paidPaise,
        currency: 'INR',
        method: body.method,
        status: 'paid',
        plan: name,
        notes:
          paidPaise < paise
            ? `Monthly package from ${startDay} — part payment (₹${(paise - paidPaise) / 100} due)`
            : `Monthly package from ${startDay}`,
        collectedBy: user._id,
      });
      pkg.payment = payment._id;
      await pkg.save();
    }
    await pkg.populate('patient', 'name patientId mobile');
    const [out] = await withUsage([pkg]);
    return NextResponse.json({ package: out }, { status: 201 });
  } catch (err) {
    console.error('create package error', err);
    return NextResponse.json({ error: 'Could not create package' }, { status: 500 });
  }
}
