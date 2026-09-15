import mongoose from 'mongoose';

// Per-doctor "default positions" configuration. Each doctor can set:
//  - defaultPoses: the poses ALWAYS pre-selected when they start an assessment
//    (their own extension/replacement of the built-in `defaultSelected` set).
//  - byCondition: extra poses to pre-select for a specific pain area, so when a
//    patient assigned to them has that pain area (e.g. "Shoulder"), the doctor's
//    curated shoulder poses light up automatically on Start Assessment.
// One document per doctor (unique). This is DISTINCT from the clinic-wide
// IdealPosture library (which stores reference IMAGES per condition); this stores
// only which capture poses each doctor prefers.

const conditionPresetSchema = new mongoose.Schema(
  {
    condition: { type: String, required: true, trim: true },
    poses: { type: [String], default: [] },
  },
  { _id: false }
);

const doctorPositionPresetSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    defaultPoses: { type: [String], default: [] },
    byCondition: { type: [conditionPresetSchema], default: [] },
  },
  { timestamps: true }
);

doctorPositionPresetSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    defaultPoses: Array.isArray(this.defaultPoses) ? this.defaultPoses : [],
    byCondition: (this.byCondition || []).map((c: any) => ({
      condition: c.condition,
      poses: Array.isArray(c.poses) ? c.poses : [],
    })),
    updatedAt: this.updatedAt,
  };
};

export const DoctorPositionPreset =
  (mongoose.models.DoctorPositionPreset as mongoose.Model<any>) ||
  mongoose.model('DoctorPositionPreset', doctorPositionPresetSchema, 'hm_doctor_position_presets');
