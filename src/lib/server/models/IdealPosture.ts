import mongoose from 'mongoose';

// A doctor-curated library of "ideal" reference posture images, grouped by
// condition / pain area (e.g. "Shoulder", "Neck", "Lower Back"). One document
// per condition — a global library shared across the clinic. When a patient
// with a matching pain area gets a report, these images auto-populate as the
// ideal-posture reference gallery (still editable per report by the doctor).

const idealImageSchema = new mongoose.Schema(
  {
    // Short caption shown under the image (e.g. "Neutral standing", "ROM flexion").
    label: { type: String, default: '' },
    // The image itself, stored as a data URL (base64). Kept inline because the
    // set is tiny (a few images per condition) and reused across many reports.
    imageData: { type: String, required: true },
  },
  { _id: false }
);

const idealPostureSchema = new mongoose.Schema(
  {
    // Canonical pain-area / condition name — matches Patient.painAreas values,
    // e.g. "Shoulder". Unique so each condition has exactly one library doc.
    condition: { type: String, required: true, unique: true, index: true, trim: true },
    images: { type: [idealImageSchema], default: [] },
    // Last doctor/admin who edited this library.
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

idealPostureSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    condition: this.condition,
    images: (this.images || []).map((img: any) => ({
      label: img.label || '',
      imageData: img.imageData,
    })),
    updatedAt: this.updatedAt,
  };
};

export const IdealPosture =
  (mongoose.models.IdealPosture as mongoose.Model<any>) ||
  mongoose.model('IdealPosture', idealPostureSchema, 'hm_ideal_postures');
