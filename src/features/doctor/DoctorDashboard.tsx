import { useEffect, useState } from 'react';
import { Search, UserPlus, ChevronRight, Users } from 'lucide-react';
import { listPatients, Patient } from '@/services/api';
import TableSkeleton from '@/components/ui/TableSkeleton';

interface Props {
  onRegister: () => void;
  onOpenPatient: (patient: Patient) => void;
}

export default function DoctorDashboard({ onRegister, onOpenPatient }: Props) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { patients } = await listPatients({ q: q.trim() || undefined, scope });
      setPatients(patients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return (
    <div className="hm-page-enter max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Patients</h2>
          <p className="text-slate-500 text-sm">Register a patient or open a record to start an AI assessment.</p>
        </div>
        <button
          onClick={onRegister}
          className="hm-lift inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-2 px-4 rounded-lg"
        >
          <UserPlus className="w-4 h-4" /> Register patient
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex-1 relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, mobile, or patient ID…"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
          />
        </form>
        <div className="flex gap-2">
          {(['mine', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                scope === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'mine' ? 'My patients' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm" data-reveal>
        {loading ? (
          <TableSkeleton rows={6} cols={3} />
        ) : patients.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            No patients yet. Register your first patient to begin.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {patients.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onOpenPatient(p)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-50/60 transition-colors text-left"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {p.name}
                      <span className="ml-2 text-xs font-mono text-gray-400">{p.patientId}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {[p.age ? `${p.age}y` : null, p.gender || null, p.mobile || null].filter(Boolean).join(' · ') || '—'}
                      {p.painAreas.length > 0 && <span className="text-red-500"> · {p.painAreas.join(', ')}</span>}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
