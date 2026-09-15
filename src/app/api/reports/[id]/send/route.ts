import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, reportReadyEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

// Manually (re)send a report to the patient by email, including the public
// no-login report link. Doctors/admin only. Optionally override the recipient
// via { to } in the body (defaults to the patient's stored email).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const report = await Report.findById(params.id)
      .populate('doctor', 'name')
      .populate('patient', 'name email');
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) || {};
    const to = (typeof body.to === 'string' && body.to.trim()) || report.patient?.email || '';
    if (!to) {
      return NextResponse.json(
        { error: 'No email on file for this patient. Add one or pass a recipient.' },
        { status: 400 }
      );
    }

    const base = process.env.APP_BASE_URL || '';
    const mail = reportReadyEmail({
      patientName: report.patient?.name || 'there',
      doctorName: report.doctor?.name,
      overallScore: report.overallScore,
      flaggedCount: report.flaggedCount,
      reportUrl: report.shareId && base ? `${base}/r/${report.shareId}` : undefined,
    });
    const { sent } = await sendMail({ to, ...mail });
    if (!sent) {
      return NextResponse.json({ error: 'Email could not be sent (SMTP not configured or send failed).' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, to });
  } catch (err) {
    console.error('send report email error', err);
    return NextResponse.json({ error: 'Could not send the report email' }, { status: 500 });
  }
}
