import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Appointment, APPOINTMENT_STATUSES } from '@/lib/server/models/Appointment';
import { Patient } from '@/lib/server/models/Patient';
import { User } from '@/lib/server/models/User';
import { requireAuth, requireRole } from '@/middleware/auth';
import { sendMail, appointmentBookedEmail } from '@/lib/server/mailer';

export const dynamic = 'force-dynamic';

// Pretty date string for emails, in IST (clinic timezone).
function formatWhen(date: Date | string) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// List appointments. Filters: ?date=YYYY-MM-DD, ?doctor=<id>, ?patient=<id>,
// ?status=. Doctors are scoped to their own appointments unless ?scope=all.
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, any> = {};

  if (user.role === 'doctor' && sp.get('scope') !== 'all') {
    filter.doctor = user._id;
  } else if (sp.get('doctor')) {
    filter.doctor = sp.get('doctor');
  }
  if (sp.get('patient')) filter.patient = sp.get('patient');
  const status = sp.get('status');
  if (status && APPOINTMENT_STATUSES.includes(status)) {
    filter.status = status;
  }

  // Single-day window (clinic-local). Defaults to no date filter.
  const date = sp.get('date');
  if (date) {
    const start = new Date(`${date}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    if (!Number.isNaN(start.getTime())) filter.scheduledAt = { $gte: start, $lt: end };
  }

  const appts = await Appointment.find(filter)
    .populate({
      path: 'patient',
      select: 'name patientId mobile assignedDoctor',
      populate: { path: 'assignedDoctor', select: 'name' },
    })
    .populate('doctor', 'name')
    .sort({ scheduledAt: 1 })
    .limit(300);
  // Enrich each row with the patient's code/mobile and their currently-assigned
  // doctor, so the schedule can show full details and fall back to the assigned
  // doctor when a specific doctor wasn't picked at booking time.
  return NextResponse.json({
    appointments: appts.map((a: any) => ({
      ...a.toJSONSafe(),
      patientCode: a.patient?.patientId ?? null,
      patientMobile: a.patient?.mobile ?? null,
      assignedDoctorName: a.patient?.assignedDoctor?.name ?? null,
    })),
  });
}

// Book an appointment. Reception/doctor/admin.
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const roleErr = requireRole(user, 'admin', 'doctor', 'reception');
  if (roleErr) return roleErr;

  try {
    await connectDB();
    const { patientId, doctorId, scheduledAt, durationMin, reason } =
      (await req.json().catch(() => ({}))) || {};
    if (!patientId || !scheduledAt) {
      return NextResponse.json({ error: 'patientId and scheduledAt are required' }, { status: 400 });
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Doctors booking for themselves; otherwise use provided doctor or the
    // patient's assigned doctor as a sensible default.
    let doctor = doctorId || patient.assignedDoctor || null;
    if (user.role === 'doctor') doctor = user._id;
    if (doctor) {
      const doc = await User.findById(doctor);
      if (!doc || doc.role !== 'doctor') {
        return NextResponse.json({ error: 'doctorId must reference a doctor account' }, { status: 400 });
      }
    }

    const appt = new Appointment({
      patient: patient._id,
      doctor: doctor || null,
      scheduledAt: when,
      durationMin: durationMin ? Number(durationMin) : 30,
      reason: reason || '',
      createdBy: user._id,
    });
    await appt.save();
    await appt.populate('patient', 'name');
    await appt.populate('doctor', 'name');

    if (patient.email) {
      const mail = appointmentBookedEmail({
        patientName: patient.name,
        doctorName: appt.doctor?.name,
        when: formatWhen(when),
        reason: reason || '',
      });
      sendMail({ to: patient.email, ...mail });
    }

    return NextResponse.json({ appointment: appt.toJSONSafe() }, { status: 201 });
  } catch (err) {
    console.error('book appointment error', err);
    return NextResponse.json({ error: 'Could not book appointment' }, { status: 500 });
  }
}
