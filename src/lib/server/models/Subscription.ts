import mongoose from 'mongoose';

export const SUBSCRIPTION_STATUSES = ['created', 'active', 'failed', 'expired'];

// A public (no-login) subscription that unlocks the AI assessment flow. Unlike
// Payment, this is not tied to a clinic Patient record — guests subscribe
// directly from the marketing site.
const subscriptionSchema = new mongoose.Schema(
  {
    plan: { type: String, required: true }, // plan id from src/lib/plans.ts
    // Amount in the smallest currency unit (paise for INR).
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'created', index: true },
    email: { type: String, default: '' },
    // When the subscription access ends (set on successful payment).
    expiresAt: { type: Date, default: null },
    // Razorpay identifiers.
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
  },
  { timestamps: true }
);

subscriptionSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    id: this._id.toString(),
    plan: this.plan,
    status: this.status,
    expiresAt: this.expiresAt,
    createdAt: this.createdAt,
  };
};

export const Subscription =
  (mongoose.models.Subscription as mongoose.Model<any>) ||
  mongoose.model('Subscription', subscriptionSchema, 'hm_subscriptions');
