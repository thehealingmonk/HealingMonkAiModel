import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { Patient } from '@/lib/server/models/Patient';
import { Appointment } from '@/lib/server/models/Appointment';
import { sendMail, appointmentBookedEmail } from '@/lib/server/mailer';
import { rateLimit, clientIp } from '@/lib/server/rateLimit';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const dynamic = 'force-dynamic';

// Public, unauthenticated booking from the marketing home page. Creates (or
// reuses) a patient record and an optional pending appointment that reception
// confirms from the desk. No auth — this is the lead-capture entry point.
export async function POST(req: NextRequest) {
  // Unauthenticated + sends email: cap per client to stop scripted spam.
  const limited = rateLimit(`booking:${clientIp(req)}`, 5, 60 * 60_000);
  if (limited) return limited;

  try {
    await connectDB();
    const body = (await req.json().catch(() => ({}))) || {};
    // Coerce to bounded strings so objects/huge payloads never reach queries.
    const name = str(body.name, 120);
    const mobile = str(body.mobile, 20);
    const email = str(body.email, 254);
    const complaint = str(body.complaint, 2000);
    const preferredAt = str(body.preferredAt, 40);
    const mode = body.mode === 'video' ? 'video' : 'clinic';
    const gender = ['Male', 'Female', 'Other'].includes(body.gender) ? body.gender : '';
    const ageNum = Number(body.age);
    const age = Number.isFinite(ageNum) && ageNum > 0 && ageNum <= 130 ? Math.round(ageNum) : undefined;
    const painAreas: string[] = Array.isArray(body.painAreas)
      ? body.painAreas.filter((a: unknown): a is string => typeof a === 'string').map((a: string) => a.slice(0, 60)).slice(0, 20)
      : [];
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!mobile && !email) {
      return NextResponse.json({ error: 'Please provide a mobile number or email' }, { status: 400 });
    }
    if (mobile && !/^[+\d][\d\s-]{6,18}$/.test(mobile)) {
      return NextResponse.json({ error: 'Please enter a valid mobile number' }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Find-or-create the patient by mobile/email to avoid duplicates.
    const cleanMobile = (mobile || '').trim();
    const cleanEmail = (email || '').toLowerCase().trim();
    let patient: any = null;
    if (cleanMobile) patient = await Patient.findOne({ mobile: cleanMobile });
    if (!patient && cleanEmail) patient = await Patient.findOne({ email: cleanEmail });
    if (!patient) {
      patient = new Patient({
        name,
        mobile: cleanMobile,
        email: cleanEmail,
        complaint: complaint || '',
        painAreas,
        gender,
        ...(age !== undefined ? { age } : {}),
      });
      await patient.save();
    }
    // An existing record is never modified here: this endpoint is anonymous, so
    // letting it change a matched patient's email would let a stranger redirect
    // that patient's invites. Staff update contact details from the console.

    let appointment: any = null;
    const when = preferredAt ? new Date(preferredAt) : null;
    // Requests for a time in the past (beyond small clock skew) are ignored.
    if (when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() - 60 * 60_000) {
      appointment = new Appointment({
        patient: patient._id,
        scheduledAt: when,
        reason: complaint || (mode === 'video' ? 'Online video consultation request' : 'Online booking request'),
        source: 'online',
        mode,
      });
      await appointment.save();

      if (patient.email) {
        const mail = appointmentBookedEmail({
          patientName: patient.name,
          when: when.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          reason: complaint || '',
        });
        sendMail({ to: patient.email, ...mail });
      }
    }

    // Same response whether the patient was new or matched by mobile/email, and
    // no internal ids: an anonymous caller must not be able to probe whether a
    // phone number belongs to a clinic patient.
    return NextResponse.json({ ok: true, appointmentRequested: Boolean(appointment) }, { status: 201 });
  } catch (err) {
    console.error('public booking error', err);
    return NextResponse.json(
      { error: 'Could not submit your booking. Please try again.' },
      { status: 500 }
    );
  }
}
