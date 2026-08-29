import mongoose from 'mongoose';

// One finding per assessment position captured during the session. Stores the
// computed measurement + severity (not the raw image — images stay client-side
// to keep payloads small).
const findingSchema = new mongoose.Schema(
  {
    assessmentId: String,
    name: String,
    bodyRegion: String,
    measurementName: String,
    value: { type: Number, default: null },
    unit: String,
    severity: { type: String, enum: ['normal', 'mild', 'moderate', 'severe', null], default: null },
    painArea: String,
    painCorrelation: String,
  },
  { _id: false }
);

const exerciseSchema = new mongoose.Schema(
  {
    name: String,
    sets: String,
    reps: String,
    frequency: String,
    forFinding: String, // which assessment recommended it
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Slug of the public (no-auth) visual report in hm_public_reports, so this
    // structured record links to a shareable, name-based `/r/:slug` URL.
    shareId: { type: String, default: null, index: true },
    painAreas: { type: [String], default: [] },
    overallScore: { type: Number, default: null },
    findingsCount: { type: Number, default: 0 },
    flaggedCount: { type: Number, default: 0 },
    findings: { type: [findingSchema], default: [] },
    suggestedExercises: { type: [exerciseSchema], default: [] },
    doctorNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

// The patient timeline query filters by `patient` and sorts newest-first; a
// compound index lets Atlas serve it straight from the index (no collection
// scan + in-memory sort), which is what made opening a patient feel slow.
reportSchema.index({ patient: 1, createdAt: -1 });

reportSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    id: this._id.toString(),
    patient: this.patient?._id ? this.patient._id.toString() : this.patient?.toString(),
    doctor: this.doctor?._id
      ? { id: this.doctor._id.toString(), name: this.doctor.name }
      : this.doctor?.toString(),
    shareId: this.shareId || null,
    painAreas: this.painAreas || [],
    overallScore: this.overallScore,
    findingsCount: this.findingsCount,
    flaggedCount: this.flaggedCount,
    findings: this.findings || [],
    suggestedExercises: this.suggestedExercises || [],
    doctorNotes: this.doctorNotes || '',
    createdAt: this.createdAt,
  };
};

// Dedicated collection (the shared EzyLoan DB also has a `reports` collection).
export const Report =
  (mongoose.models.Report as mongoose.Model<any>) ||
  mongoose.model('Report', reportSchema, 'hm_reports');
