import mongoose from 'mongoose';

// A file (image or PDF) attached to a patient — X-rays, prescriptions, outside
// reports, referral letters, etc. Reception / doctor / admin upload these; the
// file itself is kept inline as a base64 data URL (same approach as the
// ideal-posture library) so no external object storage is needed.
const patientDocumentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    // Original filename shown to staff.
    name: { type: String, required: true, trim: true },
    // MIME type, e.g. image/png, application/pdf.
    mime: { type: String, default: '' },
    // Original byte size (for display); the stored data URL is a bit larger.
    size: { type: Number, default: 0 },
    // Loose grouping so reports/x-rays/prescriptions can be told apart.
    category: { type: String, default: 'other' },
    // The file itself as a data URL (data:<mime>;base64,....).
    data: { type: String, required: true },
    // Who uploaded it (kept as a name too so it survives if the user is removed).
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

// `withData` controls whether the (potentially large) base64 payload is included.
// Listing many documents omits it and lets the client fetch/preview on demand.
patientDocumentSchema.methods.toJSONSafe = function toJSONSafe(this: any, withData = true) {
  return {
    id: this._id.toString(),
    patient: this.patient?.toString?.() ?? null,
    name: this.name,
    mime: this.mime || '',
    size: this.size || 0,
    category: this.category || 'other',
    uploadedByName: this.uploadedByName || '',
    createdAt: this.createdAt,
    ...(withData ? { data: this.data } : {}),
  };
};

export const PatientDocument =
  (mongoose.models.PatientDocument as mongoose.Model<any>) ||
  mongoose.model('PatientDocument', patientDocumentSchema, 'hm_patient_documents');
