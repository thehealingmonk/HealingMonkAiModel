import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { OnlineMeeting } from '@/lib/server/models/OnlineMeeting';
import { getUser } from '@/middleware/auth';
import { getIceServers } from '@/lib/server/ice';

export const dynamic = 'force-dynamic';

// Resolve a room by its secret token (the link). Works for BOTH:
//   • the patient joining via the shared link (no login) — the token itself is
//     the credential, so they only ever reach THEIR room, never another's;
//   • staff (admin, or the patient's assigned doctor) who are also signed in —
//     they get the full staff view + patient detail to run the assessment.
//
// The caller's role is decided server-side from their auth, not trusted from
// the client, so a patient can never obtain staff controls.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    await connectDB();
    const meeting = await OnlineMeeting.findOne({ roomToken: params.token })
      .populate('patient', 'name patientId age gender mobile email height weight painAreas complaint')
      .populate('assignedDoctor', 'name');

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const iceServers = getIceServers();

    // Staff (host) view is granted ONLY when the caller explicitly joins as host
    // (the dashboard "Join Meeting" button sends ?host=1) AND is authorised. The
    // plain shared link (no ?host) is ALWAYS the patient view — so s-admin can
    // copy it, open it themselves, and still see the patient experience, and the
    // link they forward on WhatsApp/email always joins the recipient as patient.
    const wantsHost = req.nextUrl.searchParams.get('host') === '1';
    let isStaff = false;
    if (wantsHost) {
      const user = await getUser(req).catch(() => null);
      if (user) {
        if (user.role === 'admin') isStaff = true;
        else if (user.role === 'doctor') {
          const docId = meeting.assignedDoctor?._id || meeting.assignedDoctor;
          isStaff = !!docId && docId.toString() === user._id.toString();
        }
      }
    }

    if (isStaff) {
      return NextResponse.json({ role: 'staff', iceServers, meeting: meeting.toStaffJSON() });
    }
    return NextResponse.json({ role: 'patient', iceServers, meeting: meeting.toPatientJSON() });
  } catch (err) {
    // A transient DB hiccup (the shared Atlas cluster can cold-start / drop a
    // connection) must not surface as an opaque 500 to the joining patient —
    // return a clean, retryable error the client re-attempts automatically.
    console.error('open meeting room error', err);
    return NextResponse.json({ error: 'Temporarily unavailable, retrying…' }, { status: 503 });
  }
}
