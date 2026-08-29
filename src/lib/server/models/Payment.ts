import mongoose from 'mongoose';

export const PAYMENT_STATUSES = ['created', 'paid', 'failed', 'refunded'];
// 'online' = Razorpay gateway. cash/card/upi are entered manually at the desk.
export const PAYMENT_METHODS = ['online', 'cash', 'card', 'upi'];

const paymentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    // Amount in the smallest currency unit (paise for INR).
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created', index: true },
    plan: { type: String, default: '' }, // optional subscription/plan label
    notes: { type: String, default: '' },
    // Razorpay identifiers (online only).
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Both the per-patient billing list and the global payments list sort newest
// first; these indexes serve those directly from the index.
paymentSchema.index({ patient: 1, createdAt: -1 });
paymentSchema.index({ createdAt: -1 });

paymentSchema.methods.toJSONSafe = function toJSONSafe(this: any) {
  return {
    id: this._id.toString(),
    patient: this.patient?._id ? this.patient._id.toString() : this.patient?.toString(),
    amount: this.amount,
    currency: this.currency,
    method: this.method,
    status: this.status,
    plan: this.plan || '',
    notes: this.notes || '',
    razorpayOrderId: this.razorpayOrderId,
    razorpayPaymentId: this.razorpayPaymentId,
    createdAt: this.createdAt,
  };
};

// Dedicated collection (keep all HealingMonk data in hm_* collections).
export const Payment =
  (mongoose.models.Payment as mongoose.Model<any>) ||
  mongoose.model('Payment', paymentSchema, 'hm_payments');
