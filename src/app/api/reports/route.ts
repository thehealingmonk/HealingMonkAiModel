import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Report } from '@/lib/server/models/Report';
import { Patient } from '@/lib/server/models/Patient';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, reportReadyEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

// List reports across patients. Admin sees all; a doctor sees only their own
// unless ?scope=all. Newest first. Includes basic patient info for tables.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor');
  if (roleErr) return roleErr;

  await connectDB();
  const filter: Record<string, unknown> = {};
  if (user.role === 'doctor' && req.nextUrl.searchParams.get('scope') !== 'all') {
    filter.doctor = user._id;
  }
  const reports = await Report.find(filter)
    .populate('doctor', 'name')
    .populate('patient', 'name patientId')
    .sort({ createdAt: -1 })
    .limit(300);
  return NextResponse.json({
    reports: reports.map((r: any) => ({
      ...r.toJSONSafe(),
      patientInfo: r.patient?._id
        ? { id: r.patient._id.toString(), name: r.patient.name, patientId: r.patient.patientId }
        : null,
    })),
  });
}

// Create a report from a completed AI assessment. Doctors/admin only.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'doctor', 'admin');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { patientId, painAreas, overallScore, findings, suggestedExercises, doctorNotes, shareId } =
      (await req.json().catch(() => ({}))) || {};

    if (!patientId) return NextResponse.json({ error: 'patientId is required' }, { status: 400 });
    const patient = await Patient.findById(patientId);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const list = Array.isArray(findings) ? findings : [];
    const flaggedCount = list.filter((f: any) => f.severity && f.severity !== 'normal').length;

    const report = new Report({
      patient: patient._id,
      doctor: user._id,
      shareId: typeof shareId === 'string' ? shareId : null,
      painAreas: Array.isArray(painAreas) ? painAreas : patient.painAreas,
      overallScore: typeof overallScore === 'number' ? overallScore : null,
      findings: list,
      findingsCount: list.length,
      flaggedCount,
      suggestedExercises: Array.isArray(suggestedExercises) ? suggestedExercises : [],
      doctorNotes: doctorNotes || '',
    });
    await report.save();
    await report.populate('doctor', 'name');

    // Email the patient that their report is ready (if they have an email),
    // including the public, no-login link to the full visual report.
    if (patient.email) {
      const base = process.env.APP_BASE_URL || '';
      const mail = reportReadyEmail({
        patientName: patient.name,
        doctorName: report.doctor?.name,
        overallScore: report.overallScore,
        flaggedCount: report.flaggedCount,
        reportUrl: report.shareId && base ? `${base}/r/${report.shareId}` : undefined,
      });
      sendMail({ to: patient.email, ...mail });
    }

    return NextResponse.json({ report: report.toJSONSafe() }, { status: 201 });
  } catch (err) {
    console.error('create report error', err);
    return NextResponse.json({ error: 'Could not save report' }, { status: 500 });
  }
}
