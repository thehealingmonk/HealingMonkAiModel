import { useEffect, useState } from 'react';
import { PatientPackage, listPackages } from '@/services/api';
import { formatMoney } from '@/utils/formatter';

export type DuePackage = Pick<PatientPackage, 'id' | 'name' | 'amount' | 'amountPaid' | 'amountDue'>;

/**
 * The selected patient's packages that still have a balance to pay, and the
 * one (if any) the payment being recorded goes towards ('' = a one-off bill).
 * Picking a package pre-fills the amount with its full balance.
 */
export function useDuePackages(patientId: string | null, presetPackageId: string | null, setAmount: (v: string) => void) {
  const [duePackages, setDuePackages] = useState<DuePackage[]>([]);
  const [packageId, setPackageId] = useState(presetPackageId || '');

  useEffect(() => {
    setDuePackages([]);
    if (!patientId) return setPackageId('');
    let cancelled = false;
    listPackages(patientId)
      .then((r) => {
        if (cancelled) return;
        const due = r.packages.filter((p) => p.status !== 'cancelled' && p.amountDue > 0);
        setDuePackages(due);
        const preset = due.find((p) => p.id === presetPackageId);
        if (preset) {
          setPackageId(preset.id);
          setAmount(String(preset.amountDue / 100));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // setAmount is a state setter from the caller — stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, presetPackageId]);

  const pick = (id: string) => {
    setPackageId(id);
    const p = duePackages.find((d) => d.id === id);
    if (p) setAmount(String(p.amountDue / 100));
  };

  return { duePackages, packageId, duePkg: duePackages.find((p) => p.id === packageId) || null, pick };
}

/** "Towards" chooser: each package with a pending balance, or a one-off bill. */
export function PackageDuePicker({
  duePackages,
  packageId,
  onPick,
  labelCls = 'block text-sm font-medium text-slate-700 mb-2',
}: {
  duePackages: DuePackage[];
  packageId: string;
  onPick: (id: string) => void;
  labelCls?: string;
}) {
  if (duePackages.length === 0) return null;
  const optionCls = (on: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
      on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
    }`;
  return (
    <div>
      <label className={labelCls}>Towards</label>
      <div className="space-y-2">
        {duePackages.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} className={optionCls(packageId === p.id)}>
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{p.name}</span>
              <span className="text-amber-700 font-semibold whitespace-nowrap">{formatMoney(p.amountDue)} due</span>
            </span>
            <span className="block text-xs text-slate-500">
              Fee {formatMoney(p.amount)} · paid {formatMoney(p.amountPaid)}
            </span>
          </button>
        ))}
        <button type="button" onClick={() => onPick('')} className={optionCls(packageId === '')}>
          <span className="font-medium text-slate-900">Other / one-off bill</span>
        </button>
      </div>
    </div>
  );
}

/** Hint under the amount: part payment / clears the balance / too much. */
export function DueHint({ duePkg, amount }: { duePkg: DuePackage | null; amount: string }) {
  const paise = Math.round(Number(amount) * 100);
  if (!duePkg || !(paise > 0)) return null;
  const over = paise > duePkg.amountDue;
  return (
    <p className={`text-xs mt-1.5 ${over ? 'text-red-600' : 'text-slate-500'}`}>
      {over
        ? `More than the ${formatMoney(duePkg.amountDue)} due on this package.`
        : paise < duePkg.amountDue
        ? `Part payment — ${formatMoney(duePkg.amountDue - paise)} will still be due.`
        : 'Clears the package balance.'}
    </p>
  );
}

export function exceedsDue(duePkg: DuePackage | null, amount: string): boolean {
  return !!duePkg && Math.round(Number(amount) * 100) > duePkg.amountDue;
}
