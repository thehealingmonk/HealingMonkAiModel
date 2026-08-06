import {
  PatientInfo,
  AssessmentCapture,
  ExtraShot,
  ClinicalAssessment,
  getAssessment,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  Severity,
  GaugeConfig,
  ASSESSMENT_GAUGE,
  View,
} from '@/lib/clinicalKnowledge';
import PoseIllustration from '@/components/common/PoseIllustration';
import { useState, ReactNode } from 'react';
import { FileText, Printer, RotateCcw, Activity, AlertTriangle, Stethoscope, ShieldAlert, Download, Link2, Check, ZoomIn, X } from 'lucide-react';
import { downloadReportPdf } from '@/lib/reportPdf';
import type { DoctorFindingData } from '@/services/report.service';

interface Props {
  patient: PatientInfo;
  captures: AssessmentCapture[];
  /** Extra free-angle photos taken during capture, shown as a gallery. */
  extraShots?: ExtraShot[];
  onRestart: () => void;
  /** Overrides the "New Assessment" button label (e.g. "Done" for the doctor flow). */
  restartLabel?: string;
  /** Optional extra section (e.g. overall doctor notes) rendered before the disclaimer. */
  notesSection?: ReactNode;
  /** Doctor flow: show the per-posture score/remarks block and editable exercises. */
  doctorMode?: boolean;
  /** Persisted per-posture doctor input, keyed by assessmentId (restores on reopen). */
  doctorData?: Record<string, DoctorFindingData>;
  /** Called whenever a posture's doctor score/remarks/exercises change, so they can be saved. */
  onDoctorDataChange?: (assessmentId: string, data: DoctorFindingData) => void;
  /** When set, shows a "Copy link" button so the report's permanent URL can be shared/revisited. */
  shareUrl?: string;
}

const SEVERITY_SCORE: Record<Severity, number> = { normal: 0, mild: 1, moderate: 2, severe: 3 };

// Report sections, in clinical reading order.
const VIEW_ORDER: View[] = ['front', 'side', 'back'];
const VIEW_LABEL: Record<View, string> = {
  front: 'Front View',
  side: 'Side View',
  back: 'Back View',
};

export default function ClinicalReport({ patient, captures, extraShots = [], onRestart, restartLabel, notesSection, doctorMode = false, doctorData, onDoctorDataChange, shareUrl }: Props) {
  const [downloading, setDownloading] = useState(false);

  // One-click PDF download. Composed programmatically for a crisp, consistent
  // medical document; if anything goes wrong we fall back to the browser's
  // native print-to-PDF so the user is never left without a way to save.
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadReportPdf(patient, captures, extraShots);
    } catch (err) {
      console.error('PDF export failed, falling back to print', err);
      window.print();
    } finally {
      setDownloading(false);
    }
  };

  const findings = captures
    .map((c) => ({ capture: c, assessment: getAssessment(c.assessmentId)! }))
    .filter((f) => f.assessment);

  const flagged = findings.filter(
    (f) => f.capture.severity && f.capture.severity !== 'normal'
  );

  // Simple overall posture health score: 100 minus weighted deviations.
  const totalPenalty = findings.reduce(
    (sum, f) => sum + (f.capture.severity ? SEVERITY_SCORE[f.capture.severity] : 0),
    0
  );
  const maxPenalty = findings.length * 3 || 1;
  const overallScore = Math.max(0, Math.round(100 - (totalPenalty / maxPenalty) * 100));

  // Headline "deviation from ideal" — prefer a side / full-body capture, else the
  // capture whose chain measured the most joints. Needs ≥2 joints to be meaningful.
  const postureFindings = findings.filter((f) => (f.capture.postureDeviation?.joints.length ?? 0) >= 2);
  const primaryPosture =
    (postureFindings.find((f) =>
      ['full_body_left', 'full_body_right', 'forward_head'].includes(f.assessment.id)
    ) ??
      [...postureFindings].sort(
        (a, b) => b.capture.postureDeviation!.joints.length - a.capture.postureDeviation!.joints.length
      )[0])?.capture.postureDeviation ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6faf8] py-8 text-slate-900 print:overflow-visible print:bg-white print:py-0">
      {/* Ambient soft glows to match the site — hidden when printing so the PDF stays clean. */}
      <div className="pointer-events-none absolute inset-0 print:hidden">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-emerald-300/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-cyan-200/25 blur-[140px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 print:px-0">
        {/* Action bar (hidden when printing) */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-emerald-600" /> Assessment Report
          </h1>
          <div className="flex gap-2">
            {shareUrl && <CopyLinkButton url={shareUrl} />}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-full bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white px-4 py-2 flex items-center gap-2 text-sm font-semibold transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> {downloading ? 'Preparing…' : 'Download PDF'}
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 flex items-center gap-2 text-sm transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={onRestart}
              className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold px-5 py-2 flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/25 transition-transform hover:scale-[1.03]"
            >
              <RotateCcw className="w-4 h-4" /> {restartLabel ?? 'New Assessment'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8 print:shadow-none">
          {/* Header */}
          <div className="border-b border-gray-200 pb-5 mb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-600 font-bold text-lg">HealingMonk</p>
                <p className="text-gray-500 text-sm">Clinical Posture & Movement Report</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-medium text-gray-900">{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Patient summary */}
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Patient</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Info label="Name" value={patient.name || '—'} />
              <Info label="Age / Gender" value={[patient.age, patient.gender].filter(Boolean).join(' / ') || '—'} />
              <Info label="Phone" value={patient.phone || '—'} />
              <Info label="Email" value={patient.email || '—'} />
              <Info label="Height" value={patient.height ? `${patient.height} cm` : '—'} />
              <Info label="Weight" value={patient.weight ? `${patient.weight} kg` : '—'} />
              <Info label="BMI" value={bmi(patient.height, patient.weight)} />
              <Info label="Pain Areas" value={patient.painAreas.join(', ') || '—'} />
            </div>
            {patient.complaint && (
              <div className="mt-3">
                <Info label="Chief Complaint" value={patient.complaint} />
              </div>
            )}
          </section>

          {/* Overall score */}
          <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl p-5 flex items-center gap-4">
              <div className="relative">
                <Activity className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900">{overallScore}<span className="text-lg text-gray-400">/100</span></p>
                <p className="text-sm text-gray-600">Posture Health Score</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-5">
              <p className="text-3xl font-bold text-gray-900">{findings.length}</p>
              <p className="text-sm text-gray-600">Assessments Completed</p>
            </div>
            <div className="bg-red-50 rounded-xl p-5">
              <p className="text-3xl font-bold text-red-600">{flagged.length}</p>
              <p className="text-sm text-gray-600">Findings Needing Attention</p>
            </div>
          </section>

          {/* Headline postural alignment vs the ideal ear → shoulder → hip → ankle line */}
          {primaryPosture && (
            <section className="mb-6">
              <div
                className="rounded-xl border p-4 flex items-center gap-4"
                style={{ borderColor: SEVERITY_COLOR[primaryPosture.rating], backgroundColor: '#f8fafc' }}
              >
                <div className="flex-shrink-0 text-center">
                  <p className="text-3xl font-bold leading-none" style={{ color: SEVERITY_COLOR[primaryPosture.rating] }}>
                    {primaryPosture.score.toFixed(0)}°
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">from ideal</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    Postural Alignment <span className="font-normal text-gray-500">(ear → shoulder → hip → ankle)</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Overall deviation from the ideal vertical line is{' '}
                    <b>{primaryPosture.score.toFixed(0)}°</b> ({SEVERITY_LABEL[primaryPosture.rating]}).
                    {primaryPosture.joints.some((j) => !j.aligned) &&
                      ` Out of alignment: ${primaryPosture.joints.filter((j) => !j.aligned).map((j) => j.name).join(', ')}.`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* AI disclaimer — the automated measurements are estimates, not a diagnosis */}
          <section className="mb-6">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-900">Automated estimates — not a medical diagnosis</p>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Angles, scores and severities are automated estimates and <b>may be inaccurate</b>. Final clinical
                  judgement rests with the treating doctor.
                </p>
              </div>
            </div>
          </section>

          {/* Findings — grouped by camera view (Front / Side / Back), like a clinical posture report */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Findings</h2>
            <div className="space-y-7">
              {VIEW_ORDER.map((view) => {
                const group = findings.filter((f) => f.assessment.view === view);
                if (group.length === 0) return null;
                return (
                  <div key={view}>
                    <h3 className="text-xs font-bold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-4 bg-green-600 rounded-sm" /> {VIEW_LABEL[view]}
                      <span className="text-gray-400 font-normal normal-case">· {group.length} assessment{group.length > 1 ? 's' : ''}</span>
                    </h3>
                    <div className="space-y-5">
                      {group.map(({ capture, assessment }) => (
                        <FindingCard
                          key={assessment.id}
                          capture={capture}
                          assessment={assessment}
                          doctorMode={doctorMode}
                          initialDoctorData={doctorData?.[assessment.id]}
                          onDoctorDataChange={onDoctorDataChange}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Additional angle photos captured during the session */}
          {extraShots.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Additional Views ({extraShots.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {extraShots.map((s) => (
                  <figure key={s.id} className="rounded-lg overflow-hidden border border-gray-200 break-inside-avoid">
                    <ZoomableImage src={s.imageData} alt={s.label} heightClass="h-40" />
                    <figcaption className="px-2 py-1 text-[11px] text-gray-600 bg-gray-50 truncate">{s.label}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {notesSection}

          <p className="text-[11px] text-gray-400 mt-8 border-t border-gray-100 pt-4">
            Disclaimer: Automated pose-estimation report to assist the therapist — not a substitute for in-person examination.
            Values must be validated by the treating doctor before any clinical decision.
          </p>
        </div>
      </div>
    </div>
  );
}

function FindingCard({
  capture,
  assessment,
  doctorMode,
  initialDoctorData,
  onDoctorDataChange,
}: {
  capture: AssessmentCapture;
  assessment: ClinicalAssessment;
  doctorMode: boolean;
  initialDoctorData?: DoctorFindingData;
  onDoctorDataChange?: (assessmentId: string, data: DoctorFindingData) => void;
}) {
  const sev = capture.severity;
  const color = sev ? SEVERITY_COLOR[sev] : '#9ca3af';
  const gauge = ASSESSMENT_GAUGE[assessment.id];

  // Doctor-entered fields for this posture. Kept on the client and captured in
  // the printed/PDF report; not sent to the AI (the doctor's score overrides it).
  // Initialised from any previously-saved values so a reopened report is intact.
  const [docScore, setDocScore] = useState<number | null>(initialDoctorData?.score ?? null);
  const [docRemarks, setDocRemarks] = useState(initialDoctorData?.remarks ?? '');
  // Auto exercises are the starting suggestion; the doctor edits/adds their own.
  const [docExercises, setDocExercises] = useState(
    initialDoctorData?.exercises ??
      assessment.exercises.map((ex) => `${ex.name} — ${ex.sets} sets × ${ex.reps} · ${ex.frequency}`).join('\n')
  );

  // Notify the parent (which persists) whenever any doctor field changes.
  const emitChange = (next: Partial<DoctorFindingData>) => {
    onDoctorDataChange?.(assessment.id, {
      score: next.score !== undefined ? next.score : docScore,
      remarks: next.remarks !== undefined ? next.remarks : docRemarks,
      exercises: next.exercises !== undefined ? next.exercises : docExercises,
    });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden break-inside-avoid">
      <div className="flex flex-col md:flex-row">
        {/* Left: user's captured photo (ideal line + joint angles baked in) · Right: ideal-position reference */}
        <div className="grid grid-cols-[3fr_2fr] md:w-[30rem] flex-shrink-0 bg-slate-900">
          <figure className="relative">
            {/* Patient photo WITH the AI pose overlay (dots + skeleton + plumb line)
                baked in, so the doctor sees exactly what the model measured. Uses
                object-contain (not cover) so the FULL body and every measured
                point / plumb line stays visible — cropping would hide the head or
                feet the assessment depends on. Click to view full size. Falls back
                to the raw frame only if the overlay snapshot is missing. */}
            <ZoomableImage
              src={capture.imageData || capture.rawImageData}
              alt={`${assessment.name} — patient photo with pose points`}
              heightClass="h-72"
              badge="Patient Photo · pose points"
            />
          </figure>
          <figure className="relative border-l border-gray-200 bg-slate-50 flex items-center justify-center">
            <PoseIllustration pose={assessment.id} className="w-full h-72" />
            {/* Ideal plumb reference — the target vertical the patient's line
                (drawn on the left photo) should match. */}
            <span
              className="absolute top-2 bottom-2 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-green-500 pointer-events-none"
              aria-hidden
            />
            <figcaption className="absolute bottom-1 left-1 text-[10px] font-semibold bg-green-700 text-white px-1.5 py-0.5 rounded">
              Ideal Position · plumb
            </figcaption>
          </figure>
        </div>
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900">{assessment.name}</h3>
              <p className="text-xs text-gray-500">
                {assessment.bodyRegion} · {assessment.category}
              </p>
            </div>
            {sev && (
              <span
                className="text-xs font-semibold px-2.5 py-1 rounded text-white whitespace-nowrap"
                style={{ backgroundColor: color }}
              >
                {SEVERITY_LABEL[sev]}
              </span>
            )}
          </div>

          {/* Plumb-line verdict: whether the captured standing position is correct.
              The vertical reference is drawn on the patient photo on the left. */}
          {capture.plumbLine && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded"
              style={{
                backgroundColor: capture.plumbLine.aligned ? '#dcfce7' : '#fee2e2',
                color: capture.plumbLine.aligned ? '#166534' : '#991b1b',
              }}
            >
              {capture.plumbLine.aligned
                ? '✓ Plumb line: position correct'
                : `✗ Plumb line: needs adjustment · ${capture.plumbLine.score.toFixed(0)}% off`}
            </div>
          )}

          {/* Ideal vs Your value */}
          <div className="flex items-end gap-6 mt-3">
            <div>
              <p className="text-[11px] text-gray-500">{assessment.measurementName}</p>
              <p className="text-2xl font-bold leading-none" style={{ color }}>
                {capture.value !== null ? `${capture.value}${assessment.unit}` : 'N/A'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Your value (estimate)</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500">Ideal</p>
              <p className="text-2xl font-bold leading-none text-green-600">
                {gauge ? gauge.idealLabel : assessment.ranges.normal}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">Target</p>
            </div>
          </div>

          {/* Deviation gauge: zones + ideal marker + your marker */}
          {gauge && (
            <DeviationGauge gauge={gauge} value={capture.value} unit={assessment.unit} color={color} />
          )}

          {/* Range reference table */}
          <div className="grid grid-cols-4 gap-1 mt-3 text-center text-[11px]">
            <RangeCell label="Normal" value={assessment.ranges.normal} active={sev === 'normal'} color={SEVERITY_COLOR.normal} />
            <RangeCell label="Mild" value={assessment.ranges.mild} active={sev === 'mild'} color={SEVERITY_COLOR.mild} />
            <RangeCell label="Moderate" value={assessment.ranges.moderate} active={sev === 'moderate'} color={SEVERITY_COLOR.moderate} />
            <RangeCell label="Severe" value={assessment.ranges.severe} active={sev === 'severe'} color={SEVERITY_COLOR.severe} />
          </div>

          {/* Deviation from the ideal ear → shoulder → hip → ankle line */}
          {capture.postureDeviation && capture.postureDeviation.joints.length > 0 && (
            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500">Deviation from ideal alignment</span>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded text-white"
                  style={{ backgroundColor: SEVERITY_COLOR[capture.postureDeviation.rating] }}
                >
                  {capture.postureDeviation.score.toFixed(0)}° · {SEVERITY_LABEL[capture.postureDeviation.rating]}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {capture.postureDeviation.joints.map((j) => (
                  <span
                    key={j.name}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: j.aligned ? '#dcfce7' : '#fee2e2',
                      color: j.aligned ? '#166534' : '#991b1b',
                    }}
                  >
                    {j.name} {j.angle.toFixed(0)}°
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
            <span>Pain area: <b className="text-gray-700">{assessment.painArea}</b></span>
            <span>Correlation: <b className="text-gray-700">{assessment.painCorrelation}</b></span>
            <span>Feasibility: <b className="text-gray-700">{assessment.aiFeasibility}</b></span>
            <span>Source: <b className="text-gray-700">{assessment.source}</b></span>
          </div>
        </div>
      </div>

      {/* Doctor's clinical score — filled by the doctor, overrides the AI output */}
      {doctorMode && (
      <div className="border-t border-blue-100 bg-blue-50/60 p-4 break-inside-avoid">
        <div className="flex items-center gap-2 mb-2">
          <Stethoscope className="w-4 h-4 text-blue-700" />
          <p className="text-xs font-bold text-blue-900 uppercase tracking-wide">Doctor's Clinical Score</p>
          <span className="ml-auto text-[10px] text-blue-500 font-medium">To be filled by the doctor</span>
        </div>

        {/* 1–10 score */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600">Score (1–10):</span>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  const next = docScore === n ? null : n;
                  setDocScore(next);
                  emitChange({ score: next });
                }}
                className={`w-7 h-7 rounded-md text-xs font-semibold border transition-colors ${
                  docScore === n
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {docScore !== null && (
            <span className="text-sm font-bold text-blue-800">{docScore}/10</span>
          )}
        </div>

        {/* Notes / remarks / justification */}
        <label className="block text-xs text-gray-600 mt-3 mb-1">
          Notes, remarks &amp; justification for the score
        </label>
        <textarea
          value={docRemarks}
          onChange={(e) => {
            setDocRemarks(e.target.value);
            emitChange({ remarks: e.target.value });
          }}
          placeholder="Doctor's observations, remarks, and why this score was given…"
          className="w-full min-h-[70px] border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
          The measurement above is an automated estimate, not a diagnosis. The doctor's score and remarks are the
          clinical judgement of record.
        </p>
      </div>
      )}

      {/* Recommended exercises. Doctor flow: editable (AI-suggested starting list).
          Patient flow: the static auto list for flagged findings, as before. */}
      {doctorMode ? (
        <div className="bg-amber-50 border-t border-amber-100 p-4 break-inside-avoid">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1 mb-2">
            <AlertTriangle className="w-3.5 h-3.5" /> Recommended Exercises
            <span className="ml-auto text-[10px] text-amber-500 font-medium">Suggested · editable by doctor</span>
          </p>
          <textarea
            value={docExercises}
            onChange={(e) => {
              setDocExercises(e.target.value);
              emitChange({ exercises: e.target.value });
            }}
            placeholder="One exercise per line — e.g. Chin Tucks — 3 sets × 10 · Daily"
            className="w-full min-h-[80px] border border-amber-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          />
        </div>
      ) : (
        sev && sev !== 'normal' && (
          <div className="bg-amber-50 border-t border-amber-100 p-4 break-inside-avoid">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1 mb-2">
              <AlertTriangle className="w-3.5 h-3.5" /> Recommended Exercises
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {assessment.exercises.map((ex) => (
                <div key={ex.name} className="bg-white rounded-lg p-2 border border-amber-100">
                  <p className="font-medium text-gray-800 text-sm">{ex.name}</p>
                  <p className="text-xs text-gray-500">{ex.sets} sets × {ex.reps} · {ex.frequency}</p>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}

/**
 * Horizontal "Ideal vs Your value" bar. Four colour zones (normal→severe) sized
 * from the gauge stops; a green diamond marks the ideal target and a labelled
 * needle marks the patient's measured value.
 */
function DeviationGauge({
  gauge,
  value,
  unit,
  color,
}: {
  gauge: GaugeConfig;
  value: number | null;
  unit: string;
  color: string;
}) {
  const { min, max, stops, ideal, lowerIsBetter } = gauge;
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));

  // Four zone widths between min → stops → max.
  const bounds = [min, ...stops, max];
  // Colour order runs green→red when lower is better, and red→green when higher is better.
  const zoneColors = lowerIsBetter
    ? [SEVERITY_COLOR.normal, SEVERITY_COLOR.mild, SEVERITY_COLOR.moderate, SEVERITY_COLOR.severe]
    : [SEVERITY_COLOR.severe, SEVERITY_COLOR.moderate, SEVERITY_COLOR.mild, SEVERITY_COLOR.normal];

  const youPct = value !== null ? pct(value) : null;
  const idealPct = pct(ideal);

  return (
    <div className="mt-3">
      <div className="relative h-2.5 rounded-full overflow-hidden flex">
        {zoneColors.map((c, i) => (
          <div
            key={i}
            style={{ width: `${pct(bounds[i + 1]) - pct(bounds[i])}%`, backgroundColor: c }}
          />
        ))}
      </div>
      {/* Markers sit on a thin track above the bar so they never overlap the zones. */}
      <div className="relative h-5">
        {/* Ideal target — green diamond */}
        <div
          className="absolute -top-1 -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${idealPct}%` }}
        >
          <span className="w-2.5 h-2.5 rotate-45 bg-green-600 border border-white" />
          <span className="text-[9px] text-green-700 font-semibold mt-0.5 whitespace-nowrap">Ideal</span>
        </div>
        {/* Your value — needle in the severity colour */}
        {youPct !== null && (
          <div
            className="absolute -top-1 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${youPct}%` }}
          >
            <span className="w-0.5 h-3" style={{ backgroundColor: color }} />
            <span className="text-[9px] font-bold whitespace-nowrap" style={{ color }}>
              You {value}{unit}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-between text-[9px] text-gray-400 -mt-1">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (e.g. insecure context) — fall back to a prompt.
      window.prompt('Copy this report link:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title={url}
      className="rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
    >
      {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  );
}

/**
 * Report photo that never crops the pose. Shows the image with object-contain on
 * a dark backdrop (so the whole body + baked-in points/plumb line stay visible)
 * and, on click, opens a full-screen lightbox for maximum clarity. Lazy/async
 * decoded so a report with many photos stays fast and scrolls smoothly.
 */
function ZoomableImage({
  src,
  alt,
  heightClass = 'h-72',
  badge,
}: {
  src?: string;
  alt: string;
  heightClass?: string;
  badge?: string;
}) {
  const [zoom, setZoom] = useState(false);
  if (!src) {
    return (
      <div className={`flex w-full ${heightClass} items-center justify-center bg-slate-800 text-xs text-slate-400`}>
        No image
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setZoom(true)}
        className={`group relative block w-full ${heightClass} cursor-zoom-in bg-slate-900 print:cursor-default`}
        aria-label={`View ${alt} full size`}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain"
        />
        {badge && (
          <span className="absolute bottom-1 left-1 text-[10px] font-semibold bg-black/70 text-white px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
        <span className="absolute top-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
          <ZoomIn className="w-3 h-3" /> Enlarge
        </span>
      </button>
      {zoom && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm print:hidden"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
          <button
            type="button"
            onClick={() => setZoom(false)}
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
            aria-label="Close full-size view"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-medium text-gray-900 break-words">{value}</p>
    </div>
  );
}

function RangeCell({ label, value, active, color }: { label: string; value: string; active: boolean; color: string }) {
  return (
    <div
      className="rounded p-1.5 border"
      style={{
        backgroundColor: active ? color : '#f9fafb',
        borderColor: active ? color : '#e5e7eb',
        color: active ? '#fff' : '#6b7280',
      }}
    >
      <p className="font-semibold">{label}</p>
      <p>{value}</p>
    </div>
  );
}

function bmi(height: string, weight: string): string {
  const h = parseFloat(height) / 100;
  const w = parseFloat(weight);
  if (!h || !w) return '—';
  return (w / (h * h)).toFixed(1);
}
