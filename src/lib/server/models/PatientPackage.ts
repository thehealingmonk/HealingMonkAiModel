import mongoose from 'mongoose';

// 'active' packages become expired on their own once endDay passes (derived,
// not stored); 'cancelled' is an explicit stop by the desk.
export const PACKAGE_STATUSES = ['active', 'cancelled'];

// A monthly treatment package a clinic patient has subscribed to, e.g.
// "Monthly Physio — 12 sessions". Attendance is marked against it per day.
const packageSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Sessions included; 0 = unlimited visits within the period.
    sessionsTotal: { type: Number, default: 0, min: 0 },
    // Inclusive IST calendar days, YYYY-MM-DD (see src/lib/packageDates.ts).
    startDay: { type: String, required: true },
    endDay: { type: String, required: true, index: true },
    // Amount in the smallest currency unit (paise for INR).
    amount: { type: Number, default: 0 },
    status: { type: String, enum: PACKAGE_STATUSES, default: 'active', index: true },
    notes: { type: String, default: '' },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

packageSchema.index({ patient: 1, startDay: -1 });

packageSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    id: this._id.toString(),
    patient: this.patient?._id ? this.patient._id.toString() : this.patient?.toString(),
    name: this.name,
    sessionsTotal: this.sessionsTotal || 0,
    startDay: this.startDay,
    endDay: this.endDay,
    amount: this.amount || 0,
    status: this.status,
    notes: this.notes || '',
    payment: this.payment ? this.payment.toString() : null,
    createdAt: this.createdAt,
  };
};

export const PatientPackage =
  (mongoose.models.PatientPackage as mongoose.Model<any>) ||
  mongoose.model('PatientPackage', packageSchema, 'hm_packages');
