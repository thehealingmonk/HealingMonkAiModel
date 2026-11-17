import mongoose from 'mongoose';

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // When the appointment starts.
    scheduledAt: { type: Date, required: true, index: true },
    durationMin: { type: Number, default: 30 },
    reason: { type: String, default: '' },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'scheduled', index: true },
    notes: { type: String, default: '' },
    // Reception/doctor/admin who booked it.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Where the booking came from: the public website form ('online') or staff ('clinic').
    source: { type: String, enum: ['clinic', 'online'], default: 'clinic', index: true },
    // Visit type requested: in-clinic visit or online video consultation.
    mode: { type: String, enum: ['clinic', 'video'], default: 'clinic' },
    // The online meeting created for this booking (video consultations).
    meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'OnlineMeeting', default: null },
  },
  { timestamps: true }
);

// The patient profile lists one patient's appointments sorted by time; a
// compound index serves that without scanning every appointment.
appointmentSchema.index({ patient: 1, scheduledAt: 1 });

appointmentSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  const ref = (v: any) =>
    v == null ? null : v._id ? { id: v._id.toString(), name: v.name } : v.toString();
  return {
    id: this._id.toString(),
    patient: ref(this.patient),
    doctor: ref(this.doctor),
    scheduledAt: this.scheduledAt,
    durationMin: this.durationMin,
    reason: this.reason || '',
    status: this.status,
    notes: this.notes || '',
    createdAt: this.createdAt,
    source: this.source || 'clinic',
    mode: this.mode || 'clinic',
    meeting:
      this.meeting == null
        ? null
        : this.meeting._id
          ? { id: this.meeting._id.toString(), roomToken: this.meeting.roomToken, status: this.meeting.status }
          : { id: this.meeting.toString() },
  };
};

// Dedicated collection (the shared EzyLoan DB also has an `appointments` collection).
export const Appointment =
  (mongoose.models.Appointment as mongoose.Model<any>) ||
  mongoose.model('Appointment', appointmentSchema, 'hm_appointments');
