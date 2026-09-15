import mongoose from 'mongoose';

// A doctor/admin-added custom reference position, grouped by category (body
// region, e.g. "Shoulder"). These are REFERENCE-ONLY — the AI does not measure
// them; they live in the Select Positions "dictionary" so a clinic can document
// its own poses/images per category alongside the built-in assessments. One
// document per custom position (unlike the ideal-posture library which is one
// doc per condition), so each can be added/removed independently.

const customPositionSchema = new mongoose.Schema(
  {
    // Category / body region this position belongs to (e.g. "Shoulder", "Neck").
    category: { type: String, required: true, index: true, trim: true },
    // Display name of the position (e.g. "Wall angel", "Doorway stretch").
    name: { type: String, required: true, trim: true },
    // The reference image, stored inline as a data URL (base64). Kept small by
    // the client (downscaled + JPEG) before upload.
    imageData: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// The picker lists by category, newest first within a category.
customPositionSchema.index({ category: 1, createdAt: -1 });

customPositionSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    id: this._id.toString(),
    category: this.category,
    name: this.name,
    imageData: this.imageData,
    createdAt: this.createdAt,
  };
};

export const CustomPosition =
  (mongoose.models.CustomPosition as mongoose.Model<any>) ||
  mongoose.model('CustomPosition', customPositionSchema, 'hm_custom_positions');
