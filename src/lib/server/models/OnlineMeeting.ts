import mongoose from 'mongoose';

// An online (remote) AI assessment session. This is Flow B — it does NOT replace
// the in-clinic assessment; it is an additional source of assessment images/data
// that feed the SAME report-generation pipeline. Created by an admin (s-admin)
// for a specific patient and automatically bound to that patient's ASSIGNED
// doctor, so the meeting shows up for that doctor (and only that doctor) as well.
//
// Access to the live room is by an unguessable `roomToken` (the link secret) —
// never by the Mongo `_id` — so a patient can never open another patient's
// meeting by changing an id in the URL.

export const MEETING_STATUSES = [
  'created', // just generated, link not opened yet
  'waiting', // room opened, waiting for the other party
  'active', // both parties connected, normal video consultation
  'ai_active', // AI assessment running on the patient's camera
  'completed', // report generated for this meeting
  'ended', // ended by staff
  'expired', // past its expiry window
] as const;

export type MeetingStatus = (typeof MEETING_STATUSES)[number];

const onlineMeetingSchema = new mongoose.Schema(
  {
    // Unguessable room secret; the shareable link carries this, not the _id.
    roomToken: { type: String, required: true, unique: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    // The patient's assigned doctor at creation time — this is who (besides
    // admins) is allowed to run the assessment.
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // The s-admin/staff who created the meeting.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: MEETING_STATUSES, default: 'created', index: true },
    // Positions the doctor chose to assess online (mirrors the clinic flow).
    selectedPositions: { type: [String], default: [] },
    startedAt: { type: Date, default: null },
    aiStartedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    // Link back to the generated report once the online assessment completes.
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    // Public (no-auth) shareable report slug, so any panel can open the report.
    shareId: { type: String, default: null },
    // Hard expiry for the link. Past this the room refuses to open.
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// The doctor's "Online Meetings" list and the patient timeline both query by a
// foreign key and sort newest-first — index both paths.
onlineMeetingSchema.index({ assignedDoctor: 1, createdAt: -1 });
onlineMeetingSchema.index({ patient: 1, createdAt: -1 });

// Compute the effective status, treating a past-expiry meeting as expired even
// if the stored status hasn't been swept yet.
onlineMeetingSchema.methods.effectiveStatus = function effectiveStatus(this: any): MeetingStatus {
  if (this.status !== 'ended' && this.status !== 'completed' && this.expiresAt && this.expiresAt < new Date()) {
    return 'expired';
  }
  return this.status;
};

// Full detail for staff (admin / assigned doctor). Includes the room token so
// staff can join, plus enough patient detail to run the report.
onlineMeetingSchema.methods.toStaffJSON = function toStaffJSON(this: any) {
  const p = this.patient;
  const patientPopulated = p && p._id;
  return {
    id: this._id.toString(),
    roomToken: this.roomToken,
    status: this.effectiveStatus(),
    selectedPositions: this.selectedPositions || [],
    startedAt: this.startedAt,
    aiStartedAt: this.aiStartedAt,
    endedAt: this.endedAt,
    expiresAt: this.expiresAt,
    report: this.report ? this.report.toString() : null,
    shareId: this.shareId || null,
    createdAt: this.createdAt,
    patient: patientPopulated
      ? {
          id: p._id.toString(),
          patientId: p.patientId,
          name: p.name,
          age: p.age ?? null,
          gender: p.gender || '',
          mobile: p.mobile || '',
          email: p.email || '',
          height: p.height ?? null,
          weight: p.weight ?? null,
          painAreas: p.painAreas || [],
          complaint: p.complaint || '',
        }
      : this.patient?.toString(),
    assignedDoctor:
      this.assignedDoctor && this.assignedDoctor._id
        ? { id: this.assignedDoctor._id.toString(), name: this.assignedDoctor.name }
        : this.assignedDoctor
        ? this.assignedDoctor.toString()
        : null,
  };
};

// Minimal, safe view for the patient joining by link — no clinical data, no ids
// they don't need. Just enough to render the room.
onlineMeetingSchema.methods.toPatientJSON = function toPatientJSON(this: any) {
  const p = this.patient;
  return {
    roomToken: this.roomToken,
    status: this.effectiveStatus(),
    patientName: p && p._id ? p.name : '',
  };
};

// Dedicated collection alongside the other hm_* collections (this Atlas DB is
// shared with another app).
export const OnlineMeeting =
  (mongoose.models.OnlineMeeting as mongoose.Model<any>) ||
  mongoose.model('OnlineMeeting', onlineMeetingSchema, 'hm_meetings');

// ---------------------------------------------------------------------------
// Signaling messages. WebRTC needs the two browsers to exchange SDP offers/
// answers and ICE candidates before a direct media connection forms. We relay
// those through Mongo (short-polled by the clients) so no custom WebSocket
// server is needed and the app still runs on plain `next start` / serverless.
//
// Messages are addressed peer→peer within a room and auto-expire so the
// collection stays tiny.
// ---------------------------------------------------------------------------
const meetingSignalSchema = new mongoose.Schema(
  {
    roomToken: { type: String, required: true, index: true },
    // Opaque per-connection peer id generated by each browser.
    from: { type: String, required: true },
    // Target peer id, or null for a broadcast to everyone else in the room.
    to: { type: String, default: null },
    // Signal type (offer/answer/ice/join/bye/ai/knock/admit/deny). Kept as a
    // free string — NOT an enum — so the relay never rejects a new signal kind
    // (an enum here also broke silently after hot-reload, since Mongoose reuses
    // the first-compiled schema until a full server restart).
    kind: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

// Sweep delivered/stale signals automatically after 10 minutes. ObjectId /
// createdAt ordering is used by the client to page through new messages.
meetingSignalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 });
meetingSignalSchema.index({ roomToken: 1, _id: 1 });

export const MeetingSignal =
  (mongoose.models.MeetingSignal as mongoose.Model<any>) ||
  mongoose.model('MeetingSignal', meetingSignalSchema, 'hm_meeting_signals');
