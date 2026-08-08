import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Stethoscope } from 'lucide-react';
import { Patient, listPatients } from '@/services/api';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';

export default function PatientsList() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  // The live poll re-fetches with whatever the search box currently holds.
  const { data, loading, refreshing, error, lastUpdated, refresh } = useLiveData(() =>
    listPatients({ scope: 'all', q: q.trim() || undefined })
  );
  const patients = data?.patients ?? [];

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

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={7} cols={8} />
        ) : patients.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No patients yet.</div>
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/patient/${p.id}`);
                      }}
                      className="hm-lift inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg"
                    >
                      <Stethoscope className="w-3.5 h-3.5" /> Assess
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
