import type { Payment } from '@/services/api';
import { formatDate } from '@/utils/formatter';

// Case-insensitive match of a payment against a free-text query: patient name /
// ID, doctor, service, notes, method, status, collector, reference, amount (₹)
// and date.
export function paymentMatches(p: Payment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const rupees = p.amount / 100;
  return [
    p.patientName,
    p.patientCode,
    p.doctorName,
    p.plan,
    p.notes,
    p.method,
    p.status,
    p.collectedByName,
    p.razorpayPaymentId,
    String(rupees),
    rupees.toFixed(2),
    formatDate(p.createdAt, true),
  ].some((v) => (v || '').toString().toLowerCase().includes(q));
}
