import { PatientPackage } from '@/services/api';
import { formatMoney } from '@/utils/formatter';

type Pkg = Pick<PatientPackage, 'amount' | 'amountPaid' | 'amountDue' | 'paymentStatus'>;

const TONE: Record<PatientPackage['paymentStatus'], string> = {
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-800 border-amber-200',
  unpaid: 'bg-rose-50 text-rose-700 border-rose-200',
  free: '',
};

/** Package fee status: "Paid ₹3,000", "Paid ₹1,000 of ₹3,000 · ₹2,000 due" or "Unpaid · ₹3,000 due". */
export default function PaymentBadge({ pkg, className = '' }: { pkg: Pkg; className?: string }) {
  if (pkg.paymentStatus === 'free') return null;
  const text =
    pkg.paymentStatus === 'paid'
      ? `Paid ${formatMoney(pkg.amount)}`
      : pkg.paymentStatus === 'partial'
      ? `Paid ${formatMoney(pkg.amountPaid)} of ${formatMoney(pkg.amount)} · ${formatMoney(pkg.amountDue)} due`
      : `Unpaid · ${formatMoney(pkg.amountDue)} due`;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${TONE[pkg.paymentStatus]} ${className}`}>
      {text}
    </span>
  );
}
