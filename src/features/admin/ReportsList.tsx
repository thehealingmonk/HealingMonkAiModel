import { useState } from 'react';
import { ExternalLink, Eye, X, Download } from 'lucide-react';
import { ReportListItem, listAllReports } from '@/services/api';
import { fetchStoredReport } from '@/services/report.service';
import { downloadReportPdf } from '@/lib/reportPdf';
import { formatDate } from '@/utils/formatter';
import { useLiveData } from '@/hooks/useLiveData';
import LiveBadge from '@/features/admin/LiveBadge';
import TableSkeleton from '@/components/ui/TableSkeleton';

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
  if (s == null) return 'text-slate-500';
  if (s >= 80) return 'text-emerald-600';
  if (s >= 60) return 'text-amber-600';
  return 'text-red-600';
};

const SEVERITY_BADGE: Record<string, string> = {
  normal: 'bg-emerald-100 text-emerald-700',
  mild: 'bg-amber-100 text-amber-700',
  moderate: 'bg-orange-100 text-orange-700',
  severe: 'bg-red-100 text-red-700',
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {report.patientInfo?.name || 'Patient'}
              {report.patientInfo?.patientId && (
                <span className="ml-2 font-mono text-xs text-gray-400">{report.patientInfo.patientId}</span>
              )}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {formatDate(report.createdAt, true)} · Dr. {doctorName}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className={`text-3xl font-bold leading-none ${SCORE_COLOR(report.overallScore)}`}>
                {report.overallScore ?? '—'}
                <span className="text-sm text-gray-400">/100</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Overall score</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Pain areas */}
          {report.painAreas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pain areas</h4>
              <div className="flex flex-wrap gap-1.5">
                {report.painAreas.map((a) => (
                  <span key={a} className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Findings */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Findings ({report.findings.length})
            </h4>
            {report.findings.length === 0 ? (
              <p className="text-sm text-gray-400">No findings recorded.</p>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Assessment</th>
                      <th className="px-3 py-2 font-medium">Region</th>
                      <th className="px-3 py-2 font-medium">Measurement</th>
                      <th className="px-3 py-2 font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.findings.map((f, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium text-gray-900">{f.name}</td>
                        <td className="px-3 py-2 text-gray-600">{f.bodyRegion || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {f.value != null ? `${f.value}${f.unit || ''}` : '—'}
                          {f.measurementName && <span className="text-gray-400"> · {f.measurementName}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              SEVERITY_BADGE[f.severity || 'normal'] || 'bg-gray-100 text-gray-600'
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
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Suggested exercises
              </h4>
              <ul className="space-y-1.5">
                {report.suggestedExercises.map((ex, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{ex.name}</span>
                    {(ex.sets || ex.reps || ex.frequency) && (
                      <span className="text-gray-500">
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
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Doctor notes</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{report.doctorNotes}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 p-4">
          {dlError && <span className="mr-auto text-xs text-red-600">{dlError}</span>}
          {report.shareId && (
            <>
              <button
                onClick={download}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 font-medium py-2 px-4 rounded-lg"
              >
                <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download PDF'}
              </button>
              <button
                onClick={() => openReport(report.shareId)}
                className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded-lg"
              >
                <ExternalLink className="w-4 h-4" /> Open shareable report
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="hm-lift bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold py-2 px-4 rounded-lg"
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
  const reports = data?.reports ?? [];
  const [selected, setSelected] = useState<ReportListItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dlError, setDlError] = useState('');
  const error = dlError || loadError;

  const doctorName = (d: ReportListItem['doctor']) => (d && typeof d === 'object' ? d.name : '—');

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

  return (
    <div className="hm-page-enter max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6" data-reveal="fade">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Assessment Reports</h2>
          <p className="text-slate-500 text-sm">Every AI posture assessment saved by your doctors.</p>
        </div>
        <LiveBadge lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">{error}</div>}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm" data-reveal>
        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : reports.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No reports yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
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
            <tbody className="divide-y divide-gray-100">
              {reports.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => viewReport(r)}
                  className="cursor-pointer hover:bg-emerald-50/60 transition-colors"
                  title="View this report"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {r.patientInfo?.name || '—'}
                    {r.patientInfo?.patientId && (
                      <span className="ml-2 font-mono text-xs text-gray-400">{r.patientInfo.patientId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{doctorName(r.doctor)}</td>
                  <td className={`px-4 py-3 font-bold ${SCORE_COLOR(r.overallScore)}`}>
                    {r.overallScore ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.findingsCount}</td>
                  <td className="px-4 py-3">
                    {r.flaggedCount > 0 ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        {r.flaggedCount}
                      </span>
                    ) : (
                      <span className="text-gray-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(r.createdAt, true)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewReport(r);
                        }}
                        className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 text-xs font-semibold"
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
                          className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 disabled:opacity-60 text-xs font-semibold"
                          title="Download the original report as PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingId === r.id ? 'Preparing…' : 'Download'}
                        </button>
                      )}
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
