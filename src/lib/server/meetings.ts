import crypto from 'crypto';
import mongoose from 'mongoose';
import { appBaseUrl } from '@/lib/seo';
import { OnlineMeeting } from '@/lib/server/models/OnlineMeeting';
import { Patient } from '@/lib/server/models/Patient';
import { sendMail, meetingInviteEmail } from '@/lib/server/mailer';

// Shared by POST /api/meetings and POST /api/appointments/:id/meeting.


// How long a meeting link stays valid after creation.
const MEETING_TTL_DAYS = 7;

// Pretty date string for emails, in IST (clinic timezone).
export function formatWhen(date: Date | string) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// Create one meeting for a patient, binding it to a doctor, and (best-effort)
// email the patient an invite with the room link and, when scheduled, the time.
// A doctor creating a meeting binds it to THEMSELVES (so it shows in their list);
// an admin creating one binds it to the patient's assigned doctor. Returns the
// populated staff JSON.
export async function createMeetingFor(
  creator: { id: string; role: string },
  patientId: string,
  opts: { scheduledAt?: string | Date | null; sendEmail?: boolean; doctorId?: string | null }
): Promise<{ meeting?: any; error?: string }> {
  if (!mongoose.isValidObjectId(patientId)) return { error: 'Patient not found' };
  const patient = await Patient.findById(patientId).populate('assignedDoctor', 'name');
  if (!patient) return { error: 'Patient not found' };

  let scheduledAt: Date | null = null;
  if (opts.scheduledAt) {
    const d = new Date(opts.scheduledAt);
    if (!Number.isNaN(d.getTime())) scheduledAt = d;
  }

  // Bind to the creating doctor, else to the patient's assigned doctor.
  // An explicit doctorId (e.g. the doctor assigned to an online booking) wins.
  const boundDoctor =
    creator.role === 'doctor'
      ? creator.id
      : opts.doctorId || patient.assignedDoctor?._id || patient.assignedDoctor || null;

  // Unguessable room secret — the link carries THIS, never the _id, so no
  // patient can reach another patient's room by editing the URL.
  const roomToken = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + MEETING_TTL_DAYS * 24 * 60 * 60 * 1000);

  const meeting = new OnlineMeeting({
    roomToken,
    patient: patient._id,
    assignedDoctor: boundDoctor,
    createdBy: creator.id,
    status: 'created',
    scheduledAt,
    expiresAt,
  });

  // Email the invite before responding so the UI can reflect "invite sent".
  const wantEmail = opts.sendEmail !== false;
  if (wantEmail && patient.email) {
    const base = appBaseUrl();
    if (base) {
      const mail = meetingInviteEmail({
        patientName: patient.name,
        doctorName: patient.assignedDoctor?.name,
        when: scheduledAt ? formatWhen(scheduledAt) : undefined,
        link: `${base}/m/${roomToken}`,
      });
      const { sent } = await sendMail({ to: patient.email, ...mail });
      if (sent) meeting.inviteSentAt = new Date();
    }
  }

  await meeting.save();
  await meeting.populate('patient', 'name patientId');
  await meeting.populate('assignedDoctor', 'name');
  return { meeting };
}
