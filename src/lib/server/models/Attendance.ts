import mongoose from 'mongoose';

// One visit by a package patient on one IST calendar day. The unique index
// makes "mark present" idempotent — a double tap can't count a visit twice.
const attendanceSchema = new mongoose.Schema(
  {
    package: { type: mongoose.Schema.Types.ObjectId, ref: 'PatientPackage', required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    day: { type: String, required: true }, // YYYY-MM-DD (IST)
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

attendanceSchema.index({ package: 1, day: 1 }, { unique: true });
attendanceSchema.index({ day: 1 });

export const Attendance =
  (mongoose.models.Attendance as mongoose.Model<any>) ||
  mongoose.model('Attendance', attendanceSchema, 'hm_attendance');
