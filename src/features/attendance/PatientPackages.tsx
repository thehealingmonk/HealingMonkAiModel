import { useCallback, useEffect, useState } from 'react';
import { Plus, Check, RefreshCw, CalendarCheck, Pencil, IndianRupee } from 'lucide-react';
import { Patient, PatientPackage, listPackages, markAttendance, unmarkAttendance } from '@/services/api';
import { useAuth } from '@/store/auth.store';
import { istDay, formatDay } from '@/lib/packageDates';
import { sessionsLeft, isExhausted, sessionsLabel, daysLeft } from '@/features/attendance/packageInfo';
import AttendanceCalendar from '@/features/attendance/AttendanceCalendar';
import PackageModal from '@/features/attendance/PackageModal';
import RecordPaymentModal from '@/features/reception/RecordPaymentModal';
import PaymentBadge from '@/features/attendance/PaymentBadge';

const STATE_BADGE: Record<PatientPackage['state'], string> = {
  active: 'bg-green-100 text-green-700',
  upcoming: 'bg-sky-100 text-sky-700',
  expired: 'bg-gray-200 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
};

// Patient profile section: the patient's monthly packages, each with its
// attendance calendar. Staff can mark today / fix past days; reception and
// admin can also start or renew a package from here.
export default function PatientPackages({ patient, onPaymentRecorded }: { patient: Patient; onPaymentRecorded?: () => void }) {
  const { hasRole } = useAuth();
  const canManage = hasRole('admin', 'reception');
  const today = istDay();
  const [packages, setPackages] = useState<PatientPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ renewFrom?: PatientPackage | null; editPkg?: PatientPackage | null } | null>(null);
  // Package whose pending balance is being collected.
  const [collecting, setCollecting] = useState<PatientPackage | null>(null);

  const load = useCallback(() => {
    listPackages(patient.id)
      .then((r) => setPackages(r.packages))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load packages'))
      .finally(() => setLoading(false));
  }, [patient.id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (pkg: PatientPackage, day: string, present: boolean) => {
    setBusy(`${pkg.id}:${day}`);
    setError('');
    try {
      // A day outside the package period (an old client's earlier visit)
      // stretches the period to cover it, after confirming.
      const outside = day < pkg.startDay || day > pkg.endDay;
      if (present && outside && !window.confirm(`${formatDay(day)} is outside this package (${formatDay(pkg.startDay)} – ${formatDay(pkg.endDay)}). Extend the package to include it?`)) return;
      const r = present ? await markAttendance(pkg.id, day, outside) : await unmarkAttendance(pkg.id, day);
      setPackages((list) => list.map((p) => (p.id === r.package.id ? r.package : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update attendance');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Monthly package & attendance</h3>
        {canManage && (
          <button
            onClick={() => setModal({ renewFrom: null })}
            className="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
          >
            <Plus className="w-4 h-4" /> New package
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">{error}</div>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : packages.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center text-sm text-gray-500">
          <CalendarCheck className="w-6 h-6 mx-auto mb-2 text-gray-300" />
          Not on a monthly package.
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map((p, i) => {
            const left = sessionsLeft(p);
            const todayBusy = busy === `${p.id}:${today}`;
            // Older/closed packages start collapsed to keep the profile short.
            const showCalendar = i === 0 || p.state === 'active';
            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      {p.name}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATE_BADGE[p.state]}`}>{p.state}</span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatDay(p.startDay)} – {formatDay(p.endDay)} · {sessionsLabel(p)}
                      {left !== null && ` · ${left} left`}
                      {p.state === 'active' && ` · ${daysLeft(p, today)} days left`}
                    </p>
                    <PaymentBadge pkg={p} className="mt-1.5" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && p.amountDue > 0 && p.state !== 'cancelled' && (
                      <button
                        onClick={() => setCollecting(p)}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-lg"
                      >
                        <IndianRupee className="w-4 h-4" /> Collect
                      </button>
                    )}
                    {p.state === 'active' &&
                      (p.markedToday ? (
                        <button
                          onClick={() => toggle(p, today, false)}
                          disabled={todayBusy}
                          className="inline-flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg"
                          title="Tap to undo"
                        >
                          <Check className="w-4 h-4" /> Present today
                        </button>
                      ) : (
                        !isExhausted(p) && (
                          <button
                            onClick={() => toggle(p, today, true)}
                            disabled={todayBusy}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 px-3 py-1.5 rounded-lg"
                          >
                            <Check className="w-4 h-4" /> Mark present
                          </button>
                        )
                      ))}
                    {canManage && (
                      <button
                        onClick={() => setModal({ editPkg: p })}
                        className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                      >
                        <Pencil className="w-4 h-4" /> Edit
                      </button>
                    )}
                    {canManage && i === 0 && p.state !== 'upcoming' && (
                      <button
                        onClick={() => setModal({ renewFrom: p })}
                        className="inline-flex items-center gap-1 text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg"
                      >
                        <RefreshCw className="w-4 h-4" /> Renew
                      </button>
                    )}
                  </div>
                </div>
                {showCalendar && (
                  <div className="mt-4">
                    <AttendanceCalendar
                      pkg={p}
                      busyDay={busy?.startsWith(`${p.id}:`) ? busy.slice(p.id.length + 1) : null}
                      onToggleDay={(day, present) => toggle(p, day, present)}
                      allowOutside={canManage}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <PackageModal
          presetPatient={patient}
          renewFrom={modal.renewFrom}
          editPkg={modal.editPkg}
          onClose={() => setModal(null)}
          onSaved={() => {
            load();
            onPaymentRecorded?.();
          }}
        />
      )}

      {collecting && (
        <RecordPaymentModal
          presetPatient={patient}
          presetPackageId={collecting.id}
          onClose={() => setCollecting(null)}
          onRecorded={() => {
            load();
            onPaymentRecorded?.();
          }}
        />
      )}
    </>
  );
}
