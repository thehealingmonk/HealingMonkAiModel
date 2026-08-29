import mongoose from 'mongoose';
import { nextSeq } from '@/lib/server/models/Counter';

const patientSchema = new mongoose.Schema(
  {
    // Human-readable clinic ID, e.g. "HM-000001". Generated on create.
    patientId: { type: String, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    age: { type: Number, min: 0, max: 130 },
    gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
    mobile: { type: String, trim: true, index: true },
    email: { type: String, trim: true, lowercase: true },
    painAreas: { type: [String], default: [] },
    // Free-text chief complaint / pain description.
    complaint: { type: String, default: '' },
    height: { type: Number, default: null }, // cm
    weight: { type: Number, default: null }, // kg
    // Doctor currently responsible for this patient.
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Reception/doctor/admin who registered the patient.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Assign a sequential patientId before the first save.
patientSchema.pre('save', async function assignId(this: any, next) {
  if (this.patientId) return next();
  try {
    const seq = await nextSeq('patient');
    this.patientId = `HM-${String(seq).padStart(6, '0')}`;
    next();
  } catch (err) {
    next(err as Error);
  }
});

// The list view sorts newest-first, and doctors are scoped to their own
// patients — index both so neither path needs a full collection scan.
patientSchema.index({ createdAt: -1 });
patientSchema.index({ assignedDoctor: 1, createdAt: -1 });

patientSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    id: this._id.toString(),
    patientId: this.patientId,
    name: this.name,
    age: this.age ?? null,
    gender: this.gender || '',
    mobile: this.mobile || '',
    email: this.email || '',
    painAreas: this.painAreas || [],
    complaint: this.complaint || '',
    height: this.height ?? null,
    weight: this.weight ?? null,
    assignedDoctor: this.assignedDoctor
      ? this.assignedDoctor._id
        ? { id: this.assignedDoctor._id.toString(), name: this.assignedDoctor.name }
        : this.assignedDoctor.toString()
      : null,
    createdAt: this.createdAt,
  };
};

// Dedicated collection (the shared EzyLoan DB also has a `patients` collection).
export const Patient =
  (mongoose.models.Patient as mongoose.Model<any>) ||
  mongoose.model('Patient', patientSchema, 'hm_patients');
