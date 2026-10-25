import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '@/lib/server/permissions';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: 'patient' },
    active: { type: Boolean, default: true },
    // Patient logins only: true once an admin provisions this login from a clinic
    // patient record (POST /api/patients/[id]/account). Only linked accounts may
    // see the clinic records that share their email — a self-signup email is
    // unverified and must never unlock someone else's reports.
    patientLinked: { type: Boolean, default: false },
    // Session generation. Every JWT carries the value current when it was
    // issued; bumping it (password reset, role change, deactivation) revokes all
    // previously issued tokens for this account. Missing = 0, so tokens issued
    // before this field existed stay valid until the first bump.
    tokenVersion: { type: Number, default: 0 },
    // Who created this account (admin who added a doctor/receptionist, etc.)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(this: any, plain: string) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(this: any, plain: string) {
  return bcrypt.compare(plain, this.passwordHash);
};

// Strip sensitive fields whenever a user is serialized to JSON.
userSchema.methods.toSafeJSON = function toSafeJSON(this: any) {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    active: this.active,
    createdAt: this.createdAt,
  };
};

// Dedicated collection so HealingMonk never collides with the EzyLoan app that
// shares this Atlas database (its `users` collection has a foreign username_1 index).
export const User =
  (mongoose.models.User as mongoose.Model<any>) ||
  mongoose.model('User', userSchema, 'hm_users');
