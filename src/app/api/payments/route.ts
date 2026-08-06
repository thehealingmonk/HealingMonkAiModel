import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { Payment } from '@/lib/server/models/Payment';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// List payments, optionally ?patient=<id>. Staff only.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const filter: Record<string, unknown> = {};
  const patient = req.nextUrl.searchParams.get('patient');
  if (patient) filter.patient = patient;
  // Populate the patient (with their currently-assigned doctor) and the staff
  // member who collected the payment, so reception/admin can see, per payment,
  // who paid, which doctor they're assigned to, and who took the money.
  // All-time collection totals — aggregated over the WHOLE collection (not the
  // 300-row list) so reception sees the true grand total, split by cash/online.
  const paidMatch: Record<string, unknown> = { status: 'paid' };
  if (patient && mongoose.isValidObjectId(patient)) {
    paidMatch.patient = new mongoose.Types.ObjectId(patient);
  }

  const [payments, byMethod] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .limit(300)
      .populate({
        path: 'patient',
        select: 'name patientId assignedDoctor',
        populate: { path: 'assignedDoctor', select: 'name' },
      })
      .populate('collectedBy', 'name'),
    Payment.aggregate([
      { $match: paidMatch },
      { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  let totalPaid = 0;
  let paidCount = 0;
  let cashPaid = 0;
  let onlinePaid = 0;
  for (const m of byMethod as { _id: string; total: number; count: number }[]) {
    totalPaid += m.total;
    paidCount += m.count;
    if (m._id === 'cash') cashPaid = m.total;
    else if (m._id === 'online') onlinePaid = m.total;
  }

  return NextResponse.json({
    payments: payments.map((p: any) => ({
      ...p.toJSONSafe(),
      patientName: p.patient?.name ?? null,
      patientCode: p.patient?.patientId ?? null,
      doctorName: p.patient?.assignedDoctor?.name ?? null,
      collectedByName: p.collectedBy?.name ?? null,
    })),
    summary: { totalPaid, paidCount, cashPaid, onlinePaid },
  });
}
