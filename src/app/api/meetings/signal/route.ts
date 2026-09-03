import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/server/db';
import { OnlineMeeting, MeetingSignal } from '@/lib/server/models/OnlineMeeting';

export const dynamic = 'force-dynamic';

// WebRTC signaling relay (Mongo-backed, short-polled by clients). No custom
// WebSocket server is needed, so the app still runs on plain `next start`.
//
// Access control: possession of the room's secret token IS the credential to
// participate in that room's signaling (same model as a Google-Meet/Zoom link).
// Because the token is unguessable and per-meeting, a peer can only ever relay
// within its own room. Signaling only carries connection metadata (SDP/ICE) —
// no clinical data — and staff controls (Start AI, report, end) are separately
// gated behind JWT + membership on the /api/meetings/[id] routes.

async function joinableMeeting(token: string) {
  await connectDB();
  const meeting = await OnlineMeeting.findOne({ roomToken: token });
  if (!meeting) return null;
  const status = meeting.effectiveStatus();
  if (status === 'ended' || status === 'expired') return null;
  return meeting;
}

// Send one signal (offer / answer / ice / join / bye / presence / ai) to a peer
// (or broadcast to the rest of the room when `to` is omitted).
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) || {};
    const { token, from, to, kind, data } = body;
    if (!token || !from || !kind) {
      return NextResponse.json({ error: 'token, from and kind are required' }, { status: 400 });
    }
    const meeting = await joinableMeeting(token);
    if (!meeting) return NextResponse.json({ error: 'Room not available' }, { status: 404 });

    await MeetingSignal.create({
      roomToken: token,
      from: String(from),
      to: to ? String(to) : null,
      kind,
      data: data ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('signal POST error', err);
    return NextResponse.json({ error: 'Signal relay unavailable' }, { status: 503 });
  }
}

// Clear the room's signaling backlog. The host calls this when (re)starting a
// meeting so a fresh negotiation isn't confused by stale offers/candidates left
// over from earlier attempts (signals otherwise live for their TTL window).
export async function DELETE(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });
  try {
    await connectDB();
    await MeetingSignal.deleteMany({ roomToken: token });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('signal DELETE error', err);
    return NextResponse.json({ ok: false });
  }
}

// Poll for signals addressed to this peer (or broadcast) that arrived after the
// last one we saw. `after` is the last signal id the client processed; ObjectId
// ordering is time-based so `_id > after` yields exactly the new messages.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = sp.get('token');
  const peer = sp.get('peer');
  const after = sp.get('after');
  if (!token || !peer) {
    return NextResponse.json({ error: 'token and peer are required' }, { status: 400 });
  }
  try {
    await connectDB();

    const filter: Record<string, unknown> = {
      roomToken: token,
      from: { $ne: peer }, // never echo a peer's own messages back to it
      $or: [{ to: peer }, { to: null }], // addressed to me, or broadcast
    };
    if (after && mongoose.isValidObjectId(after)) {
      filter._id = { $gt: new mongoose.Types.ObjectId(after) };
    }

    const signals = await MeetingSignal.find(filter).sort({ _id: 1 }).limit(50);
    return NextResponse.json({
      signals: signals.map((s: any) => ({
        id: s._id.toString(),
        from: s.from,
        to: s.to,
        kind: s.kind,
        data: s.data,
      })),
    });
  } catch (err) {
    // Poll failures are non-fatal — the client keeps polling — so return an
    // empty batch rather than a 500 that would spam the console.
    console.error('signal GET error', err);
    return NextResponse.json({ signals: [] });
  }
}
