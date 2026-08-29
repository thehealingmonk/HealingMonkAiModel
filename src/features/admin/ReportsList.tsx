import { useMemo, useState } from 'react';
import { ExternalLink, Eye, X, Download, Trash2, ArrowDownUp } from 'lucide-react';
import { ReportListItem, listAllReports, deleteReport } from '@/services/api';
import { fetchStoredReport } from '@/services/report.service';
import { downloadReportPdf } from '@/lib/reportPdf';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ExportButton from '@/components/ui/ExportButton';
import {
  StatStrip,
  SegmentedFilter,
  SearchBox,
  DateRange,
  DATE_RANGE_OPTIONS,
  inRange,
  isToday,
  isWithinDays,
} from '@/components/ui/ListControls';

// Open a report's public, no-auth visual URL (name-based /r/:slug) in a new tab.
function openReport(shareId: string | null) {
  if (shareId) window.open(`/r/${shareId}`, '_blank', 'noopener');
}

// Download the exact same PDF the original report produces. The pose images and
// captures live in the public "stored report" (keyed by shareId), not in the DB
// summary — so we fetch that first, then hand it to the shared PDF generator.
async function downloadOriginalPdf(shareId: string) {
  const stored = await fetchStoredReport(shareId);
  if (!stored) throw new Error('Original report data not found');
  await downloadReportPdf(stored.patient, stored.captures, stored.extraShots);
}

const SCORE_COLOR = (s: number | null) => {
  if (s == null) return 'text-slate-400';
  if (s >= 80) return 'text-emerald-400';
  if (s >= 60) return 'text-amber-400';
  return 'text-rose-400';
};

const SEVERITY_BADGE: Record<string, string> = {
  normal: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20',
  mild: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/20',
  moderate: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/20',
  severe: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20',
};

// In-app report detail. Works for every report — including those with no
// shareable link — since the row already carries the full findings/notes.
function ReportDetailModal({ report, onClose }: { report: ReportListItem; onClose: () => void }) {
  const doctorName = report.doctor && typeof report.doctor === 'object' ? report.doctor.name : '—';
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError] = useState('');

  const download = async () => {
    if (!report.shareId) return;
    setDownloading(true);
    setDlError('');
    try {
      await downloadOriginalPdf(report.shareId);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Could not download report');
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl my-8 rounded-2xl border border-white/10 bg-[#1f2b48] text-slate-200 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 p-6">
          <div>
            <h3 className="text-xl font-bold text-white">
              {report.patientInfo?.name || 'Patient'}
              {report.patientInfo?.patientId && (
                <span className="ml-2 font-mono text-xs text-slate-400">{report.patientInfo.patientId}</span>
              )}
            </h3>
            <p className="text-sm text-slate-400 mt-1">
              {formatDate(report.createdAt, true)} · Dr. {doctorName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className={`text-3xl font-bold leading-none ${SCORE_COLOR(report.overallScore)}`}>
                {report.overallScore ?? '—'}
                <span className="text-sm text-slate-400">/100</span>
              </p>
              <p className="text-xs text-slate-400 mt-1">Overall score</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Pain areas */}
          {report.painAreas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Pain areas</h4>
              <div className="flex flex-wrap gap-1.5">
                {report.painAreas.map((a) => (
                  <span key={a} className="text-xs font-medium bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20 px-2 py-0.5 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Findings ({report.findings.length})
            </h4>
            {report.findings.length === 0 ? (
              <p className="text-sm text-slate-400">No findings recorded.</p>
            ) : (
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-slate-400 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Assessment</th>
                      <th className="px-3 py-2 font-medium">Region</th>
                      <th className="px-3 py-2 font-medium">Measurement</th>
                      <th className="px-3 py-2 font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {report.findings.map((f, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-white">{f.name}</td>
                        <td className="px-3 py-2 text-slate-300">{f.bodyRegion || '—'}</td>
                        <td className="px-3 py-2 text-slate-300">
                          {f.value != null ? `${f.value}${f.unit || ''}` : '—'}
                          {f.measurementName && <span className="text-slate-400"> · {f.measurementName}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              SEVERITY_BADGE[f.severity || 'normal'] || 'bg-white/10 text-slate-300'
                            }`}
                          >
                            {f.severity || 'normal'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Suggested exercises */}
          {report.suggestedExercises.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Suggested exercises
              </h4>
              <ul className="space-y-1.5">
                {report.suggestedExercises.map((ex, i) => (
                  <li key={i} className="text-sm text-slate-300">
                    <span className="font-medium text-white">{ex.name}</span>
                    {(ex.sets || ex.reps || ex.frequency) && (
                      <span className="text-slate-400">
                        {' '}
                        — {[ex.sets, ex.reps, ex.frequency].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Doctor notes */}
          {report.doctorNotes && (
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Doctor notes</h4>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{report.doctorNotes}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 p-4">
          {dlError && <span className="mr-auto text-xs text-rose-300">{dlError}</span>}
          {report.shareId && (
            <>
              <button
                onClick={download}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-60 font-medium py-2 px-4"
              >
                <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download PDF'}
              </button>
              <button
                onClick={() => openReport(report.shareId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 font-medium py-2 px-4"
              >
                <ExternalLink className="w-4 h-4" /> Open shareable report
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="hm-lift bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-2 px-4 rounded-lg shadow-lg shadow-emerald-500/30"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsList() {
  const { data, loading, refreshing, error: loadError, lastUpdated, refresh } = useLiveData(() =>
    listAllReports('all')
  );
  const allReports = data?.reports ?? [];
  const [selected, setSelected] = useState<ReportListItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dlError, setDlError] = useState('');
  const error = dlError || loadError;

  // Filters & sorting (all client-side — the list already holds every report).
  const [q, setQ] = useState('');
  const [range, setRange] = useState<DateRange>('all');
  const [quality, setQuality] = useState<'all' | 'flagged' | 'low' | 'high'>('all');
  const [sort, setSort] = useState<'recent' | 'scoreDesc' | 'scoreAsc' | 'flagged'>('recent');

  const doctorName = (d: ReportListItem['doctor']) => (d && typeof d === 'object' ? d.name : '—');

  // Live totals across the full dataset (before filtering) so counts are stable.
  const totals = useMemo(() => {
    const scored = allReports.filter((r) => r.overallScore != null);
    const avg = scored.length
      ? Math.round(scored.reduce((s, r) => s + (r.overallScore ?? 0), 0) / scored.length)
      : 0;
    return {
      total: allReports.length,
      today: allReports.filter((r) => isToday(r.createdAt)).length,
      week: allReports.filter((r) => isWithinDays(r.createdAt, 7)).length,
      flagged: allReports.filter((r) => r.flaggedCount > 0).length,
      avg,
    };
  }, [allReports]);

  const reports = useMemo(() => {
    const term = q.trim().toLowerCase();
    let rows = allReports.filter((r) => {
      if (!inRange(r.createdAt, range)) return false;
      if (quality === 'flagged' && r.flaggedCount === 0) return false;
      if (quality === 'low' && !(r.overallScore != null && r.overallScore < 60)) return false;
      if (quality === 'high' && !(r.overallScore != null && r.overallScore >= 80)) return false;
      if (term) {
        const hay = `${r.patientInfo?.name || ''} ${r.patientInfo?.patientId || ''} ${doctorName(r.doctor)} ${r.painAreas.join(' ')}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'scoreDesc') return (b.overallScore ?? -1) - (a.overallScore ?? -1);
      if (sort === 'scoreAsc') return (a.overallScore ?? 999) - (b.overallScore ?? 999);
      if (sort === 'flagged') return b.flaggedCount - a.flaggedCount;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });
    return rows;
  }, [allReports, q, range, quality, sort]);

  const exportColumns = [
    { header: 'Date', value: (r: ReportListItem) => formatDate(r.createdAt, true) },
    { header: 'Patient', value: (r: ReportListItem) => r.patientInfo?.name || '' },
    { header: 'Patient ID', value: (r: ReportListItem) => r.patientInfo?.patientId || '' },
    { header: 'Doctor', value: (r: ReportListItem) => doctorName(r.doctor) },
    { header: 'Overall score', value: (r: ReportListItem) => r.overallScore ?? '' },
    { header: 'Findings', value: (r: ReportListItem) => r.findingsCount },
    { header: 'Flagged', value: (r: ReportListItem) => r.flaggedCount },
    { header: 'Pain areas', value: (r: ReportListItem) => r.painAreas.join('; ') },
  ];

  // Show the report exactly as it looks when created: open the full visual
  // report (/r/:slug). Old reports with no share link fall back to the summary.
  const viewReport = (r: ReportListItem) => {
    if (r.shareId) openReport(r.shareId);
    else setSelected(r);
  };

  // Download the original report as a PDF straight from the list.
  const downloadReport = async (r: ReportListItem) => {
    if (!r.shareId) return;
    setDlError('');
    setDownloadingId(r.id);
    try {
      await downloadOriginalPdf(r.shareId);
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Could not download report');
    } finally {
      setDownloadingId(null);
    }
  };

  // Permanently delete a report, then refresh the live list.
  const removeReport = async (r: ReportListItem) => {
    const who = r.patientInfo?.name || 'this patient';
    if (!window.confirm(`Delete the report for ${who}? This cannot be undone.`)) return;
    setDlError('');
    setDeletingId(r.id);
    try {
      await deleteReport(r.id);
      await refresh();
    } catch (e) {
      setDlError(e instanceof Error ? e.message : 'Could not delete report');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Assessment Reports</h2>
          <p className="text-slate-400 text-sm">Every AI posture assessment saved by your doctors.</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton filename="reports" columns={exportColumns} rows={reports} />
          <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
        </div>
      </div>

      {error && <div className="bg-rose-400/10 border border-rose-400/30 text-rose-200 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      {/* Live totals */}
      <StatStrip
        items={[
          { label: 'Total reports', value: totals.total },
          { label: 'Today', value: totals.today, tint: 'text-emerald-300' },
          { label: 'Last 7 days', value: totals.week, tint: 'text-sky-300' },
          { label: 'Flagged', value: totals.flagged, tint: 'text-rose-300' },
          { label: 'Avg score', value: totals.avg, tint: 'text-violet-300' },
        ]}
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3" data-reveal="fade">
        <SearchBox value={q} onChange={setQ} placeholder="Search patient / doctor / pain area" />
        <SegmentedFilter value={range} options={DATE_RANGE_OPTIONS} onChange={setRange} ariaLabel="Date range" />
        <SegmentedFilter
          value={quality}
          onChange={setQuality}
          ariaLabel="Quality filter"
          options={[
            { value: 'all', label: 'All' },
            { value: 'flagged', label: 'Flagged' },
            { value: 'low', label: 'Low score' },
            { value: 'high', label: 'Healthy' },
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
            <option value="scoreDesc">Score: high → low</option>
            <option value="scoreAsc">Score: low → high</option>
            <option value="flagged">Most flagged</option>
          </select>
        </label>
      </div>

      <div className="glass-dark rounded-2xl overflow-x-auto" data-reveal>
        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : reports.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            {allReports.length === 0 ? 'No reports yet.' : 'No reports match these filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Doctor</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Findings</th>
                <th className="px-4 py-3 font-medium">Flagged</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {reports.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => viewReport(r)}
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  title="View this report"
                >
                  <td className="px-4 py-3 font-medium text-white">
                    {r.patientInfo?.name || '—'}
                    {r.patientInfo?.patientId && (
                      <span className="ml-2 font-mono text-xs text-slate-400">{r.patientInfo.patientId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{doctorName(r.doctor)}</td>
                  <td className={`px-4 py-3 font-bold ${SCORE_COLOR(r.overallScore)}`}>
                    {r.overallScore ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.findingsCount}</td>
                  <td className="px-4 py-3">
                    {r.flaggedCount > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20">
                        {r.flaggedCount}
                      </span>
                    ) : (
                      <span className="text-slate-500">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{formatDate(r.createdAt, true)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewReport(r);
                        }}
                        className="inline-flex items-center gap-1.5 text-emerald-300 hover:text-emerald-200 text-xs font-semibold"
                      >
                        <Eye className="w-3.5 h-3.5" /> View report
                      </button>
                      {r.shareId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadReport(r);
                          }}
                          disabled={downloadingId === r.id}
                          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white disabled:opacity-60 text-xs font-semibold"
                          title="Download the original report as PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingId === r.id ? 'Preparing…' : 'Download'}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeReport(r);
                        }}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-300 disabled:opacity-60 text-xs font-semibold"
                        title="Delete this report"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingId === r.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && <ReportDetailModal report={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
