import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/server/db';
import { OnlineMeeting, MeetingStatus } from '@/lib/server/models/OnlineMeeting';
import { requireAuth, requireRole } from '@/middleware/auth';

export const dynamic = 'force-dynamic';

// Is this staff member allowed to act on this meeting? Admins can touch every
// meeting; a doctor may ONLY touch a meeting bound to them (their assigned
// patient). This is the guard that keeps Doctor B out of Doctor A's meetings.
function staffCanAccess(user: any, meeting: any): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'doctor') {
    const docId = meeting.assignedDoctor?._id || meeting.assignedDoctor;
    return !!docId && docId.toString() === user._id.toString();
  }
  return false;
}

async function loadOwned(req: NextRequest, id: string) {
  const auth = await requireAuth(req);
  if (auth.error) return { error: auth.error } as const;
  const roleErr = requireRole(auth.user, 'admin', 'doctor');
  if (roleErr) return { error: roleErr } as const;

  await connectDB();
  const meeting = await OnlineMeeting.findById(id)
    .populate('patient', 'name patientId age gender mobile email height weight painAreas complaint')
    .populate('assignedDoctor', 'name');
  if (!meeting) {
    return { error: NextResponse.json({ error: 'Meeting not found' }, { status: 404 }) } as const;
  }
  if (!staffCanAccess(auth.user, meeting)) {
    return { error: NextResponse.json({ error: 'Forbidden: not your meeting' }, { status: 403 }) } as const;
  }
  return { user: auth.user, meeting } as const;
}

// Staff detail — full meeting incl. room token and patient info to run the
// online assessment.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwned(req, params.id);
  if ('error' in res) return res.error;
  return NextResponse.json({ meeting: res.meeting.toStaffJSON() });
}

// Update meeting state — drive the status machine (waiting → active → ai_active
// → active → completed/ended), record selected positions, and link the report
// once the online assessment generates one. Staff only.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwned(req, params.id);
  if ('error' in res) return res.error;
  const { meeting } = res;

  const body = (await req.json().catch(() => ({}))) || {};

  if (typeof body.status === 'string') {
    const next = body.status as MeetingStatus;
    // Never resurrect a finished meeting via status; those are terminal.
    if (meeting.status !== 'ended') {
      meeting.status = next;
      if (next === 'active' && !meeting.startedAt) meeting.startedAt = new Date();
      if (next === 'ai_active' && !meeting.aiStartedAt) meeting.aiStartedAt = new Date();
    }
  }
  if (Array.isArray(body.selectedPositions)) meeting.selectedPositions = body.selectedPositions;
  if (typeof body.reportId === 'string') meeting.report = body.reportId;
  if (typeof body.shareId === 'string') meeting.shareId = body.shareId;

  await meeting.save();
  return NextResponse.json({ meeting: meeting.toStaffJSON() });
}

// End a meeting (terminal). Staff only.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const res = await loadOwned(req, params.id);
  if ('error' in res) return res.error;
  const { meeting } = res;
  meeting.status = 'ended';
  meeting.endedAt = new Date();
  await meeting.save();
  return NextResponse.json({ meeting: meeting.toStaffJSON() });
}
