import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { PatientPackage, paidByPackage, paymentState } from '@/lib/server/packages';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Pending payments: every non-cancelled package whose fee isn't fully paid yet
// (nothing paid, or a partial payment), biggest balance first, plus the total
// outstanding. Staff only.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const pkgs = await PatientPackage.find({ status: 'active', amount: { $gt: 0 } })
      .select('patient name amount startDay endDay payment')
      .populate('patient', 'name patientId mobile')
      .lean();
    const paid = await paidByPackage(pkgs);

    const dues = (pkgs as any[])
      .map((p) => {
        const id = p._id.toString();
        const amountPaid = paid.get(id) || 0;
        return {
          id,
          patient: p.patient?._id ? p.patient._id.toString() : String(p.patient),
          patientName: p.patient?.name ?? null,
          patientCode: p.patient?.patientId ?? null,
          patientMobile: p.patient?.mobile ?? null,
          name: p.name,
          startDay: p.startDay,
          endDay: p.endDay,
          amount: p.amount,
          amountPaid,
          amountDue: Math.max(0, p.amount - amountPaid),
          paymentStatus: paymentState(p.amount, amountPaid),
        };
      })
      .filter((d) => d.amountDue > 0)
      .sort((a, b) => b.amountDue - a.amountDue);

    return NextResponse.json({
      dues,
      totalDue: dues.reduce((s, d) => s + d.amountDue, 0),
      partialCount: dues.filter((d) => d.paymentStatus === 'partial').length,
    });
  } catch (err) {
    console.error('list dues error', err);
    return NextResponse.json({ error: 'Could not load pending payments' }, { status: 500 });
  }
}
