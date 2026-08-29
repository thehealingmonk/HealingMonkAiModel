import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Stethoscope, Pencil, Trash2, ArrowDownUp } from 'lucide-react';
import { Patient, listPatients, deletePatient } from '@/services/api';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';
import PatientEditModal from '@/components/common/PatientEditModal';
import {
  StatStrip,
  SegmentedFilter,
  DateRange,
  DATE_RANGE_OPTIONS,
  inRange,
  isToday,
  isWithinDays,
} from '@/components/ui/ListControls';

export default function PatientsList() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  // The live poll re-fetches with whatever the search box currently holds.
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() =>
    listPatients({ scope: 'all', q: q.trim() || undefined })
  );
  const loaded = data?.patients ?? [];

  // Client-side refinement on top of the server search.
  const [range, setRange] = useState<DateRange>('all');
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'oldest'>('recent');

  const counts = useMemo(
    () => ({
      total: loaded.length,
      today: loaded.filter((p) => isToday(p.createdAt)).length,
      week: loaded.filter((p) => isWithinDays(p.createdAt, 7)).length,
      unassigned: loaded.filter((p) => !(p.assignedDoctor && typeof p.assignedDoctor === 'object')).length,
    }),
    [loaded]
  );

  const patients = useMemo(() => {
    const rows = loaded.filter((p) => {
      if (!inRange(p.createdAt, range)) return false;
      if (gender !== 'all' && (p.gender || '').toLowerCase() !== gender) return false;
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return sort === 'oldest' ? ta - tb : tb - ta;
    });
  }, [loaded, range, gender, sort]);

  // Correct a wrong entry (edit) or remove a duplicate/double entry (delete).
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [delPatient, setDelPatient] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState('');

  const handleDelete = async () => {
    if (!delPatient) return;
    setDelError('');
    setDeleting(true);
    try {
      await deletePatient(delPatient.id);
      setDelPatient(null);
      refresh();
    } catch (err) {
      setDelError(err instanceof Error ? err.message : 'Could not delete patient');
    } finally {
      setDeleting(false);
    }
  };

  const doctorName = (d: Patient['assignedDoctor']) =>
    d && typeof d === 'object' ? d.name : '—';

  const exportColumns = [
    { header: 'Patient ID', value: (p: Patient) => p.patientId },
    { header: 'Name', value: (p: Patient) => p.name },
    { header: 'Age', value: (p: Patient) => p.age ?? '' },
    { header: 'Gender', value: (p: Patient) => p.gender || '' },
    { header: 'Mobile', value: (p: Patient) => p.mobile || '' },
    { header: 'Email', value: (p: Patient) => p.email || '' },
    { header: 'Pain areas', value: (p: Patient) => p.painAreas.join('; ') },
    { header: 'Assigned doctor', value: (p: Patient) => doctorName(p.assignedDoctor) },
    { header: 'Registered', value: (p: Patient) => formatDate(p.createdAt, true) },
  ];

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Patients</h2>
          <p className="text-slate-400 text-sm">All registered patients — open a patient to run an AI assessment.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refresh();
            }}
            className="flex gap-2"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name / mobile / ID"
                className="pl-9 pr-3 py-2 rounded-lg border border-white/15 bg-white/5 text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-emerald-400/60 focus:border-transparent"
              />
            </div>
            <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 font-medium py-2 px-3">
              <Search className="w-4 h-4" />
            </button>
          </form>
          <ExportButton filename="patients" columns={exportColumns} rows={patients} />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <StatStrip
        items={[
          { label: 'Total patients', value: counts.total },
          { label: 'New today', value: counts.today, tint: 'text-emerald-300' },
          { label: 'Last 7 days', value: counts.week, tint: 'text-sky-300' },
          { label: 'Unassigned', value: counts.unassigned, tint: 'text-amber-300' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3" data-reveal="fade">
        <SegmentedFilter value={range} options={DATE_RANGE_OPTIONS} onChange={setRange} ariaLabel="Registered range" />
        <SegmentedFilter
          value={gender}
          onChange={setGender}
          ariaLabel="Gender filter"
          options={[
            { value: 'all', label: 'All' },
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
        />
        <label className="ml-auto inline-flex items-center gap-2 text-xs font-medium text-slate-400">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs font-semibold text-white focus:ring-2 focus:ring-emerald-400/60 [&>option]:text-slate-900"
          >
            <option value="recent">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name (A–Z)</option>
          </select>
        </label>
      </div>

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={7} cols={8} />
        ) : patients.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            {loaded.length === 0 ? 'No patients yet.' : 'No patients match these filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Age / Gender</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                <th className="px-4 py-3 font-medium">Pain areas</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {patients.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/admin/patient/${p.id}`)}
                  className="hover:bg-white/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{p.patientId}</td>
                  <td className="px-4 py-3 font-medium text-white">{p.name}</td>
                  <td className="px-4 py-3 text-slate-300">{p.age ?? '—'}{p.gender ? ` · ${p.gender}` : ''}</td>
                  <td className="px-4 py-3 text-slate-300">{p.mobile || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{p.painAreas.length ? p.painAreas.join(', ') : '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{doctorName(p.assignedDoctor)}</td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(p.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/patient/${p.id}`);
                        }}
                        className="hm-lift inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg"
                      >
                        <Stethoscope className="w-3.5 h-3.5" /> Assess
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditPatient(p);
                        }}
                        title="Edit patient"
                        aria-label="Edit patient"
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-white/15 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDelError('');
                          setDelPatient(p);
                        }}
                        title="Delete duplicate"
                        aria-label="Delete patient"
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-400/30 text-rose-300 hover:bg-rose-400/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editPatient && (
        <PatientEditModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={() => { setEditPatient(null); refresh(); }}
        />
      )}

      {delPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 p-6 hm-page-enter">
            <div className="flex items-center gap-2 mb-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-bold text-slate-900">Delete patient?</h3>
            </div>
            <p className="text-sm text-slate-600">
              This permanently removes <b>{delPatient.name}</b> ({delPatient.patientId}). Use this for a
              duplicate/double entry. Any existing reports remain as history.
            </p>
            {delError && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{delError}</div>
            )}
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => setDelPatient(null)}
                disabled={deleting}
                className="flex-1 border border-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
