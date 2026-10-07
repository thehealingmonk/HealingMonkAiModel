import mongoose from 'mongoose';

// Stores a full public (guest) assessment report — patient, captures with
// baked-in pose images, extra shots and the doctor's edits — so a report URL
// (`/assessment/report/:id`) can be reopened from ANY browser or device, not
// just the one that generated it.
//
// The whole client-side StoredReport blob is kept in `data` (Mixed) so we don't
// have to mirror its evolving shape in Mongoose. Keyed by the client-generated
// `reportId` (e.g. `rep_abc123`).
const publicReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    // SHA-256 of the secret edit key held by the device that created the report.
    // Reading only needs the URL; overwriting needs this key (or a clinical
    // staff login), so a shared link can't be used to tamper with the report.
    // Null for reports created before keys existed — those are staff-editable only.
    editKeyHash: { type: String, default: null, select: false },
  },
  { timestamps: true, minimize: false }
);

// Dedicated collection, prefixed to sit alongside the other hm_* collections.
export const PublicReport =
  (mongoose.models.PublicReport as mongoose.Model<any>) ||
  mongoose.model('PublicReport', publicReportSchema, 'hm_public_reports');
