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
import { useState, useRef, useEffect, ReactNode } from 'react';
import { FileText, Printer, RotateCcw, Activity, AlertTriangle, Stethoscope, ShieldAlert, Download, Link2, Check, ZoomIn, X, ImagePlus, Upload, FolderPlus, Plus, ImageIcon } from 'lucide-react';
import { downloadReportPdf } from '@/lib/reportPdf';
import type { DoctorFindingData } from '@/services/report.service';
import { listIdealPostures, saveIdealPosture, IDEAL_POSTURE_CONDITIONS, type IdealPostureSet, type IdealPostureImage } from '@/services/api';

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
  /** Doctor-curated ideal reference postures for the patient's pain areas (auto-populated). */
  idealPostures?: IdealPostureSet[];
}

const SEVERITY_SCORE: Record<Severity, number> = { normal: 0, mild: 1, moderate: 2, severe: 3 };

// Report sections, in clinical reading order.
const VIEW_ORDER: View[] = ['front', 'back', 'side'];
const VIEW_LABEL: Record<View, string> = {
  front: 'Front View',
  side: 'Side View',
  back: 'Back View',
};

// Default "ideal posture" reference illustrations shipped in /public/report.
// Shown as the reference beside each finding. There are three references:
// a frontal dotted-body view (for front & back photos) and two side profiles —
// one facing left, one facing right — so left- and right-side findings each get
// the matching profile. (encodeURI keeps the spaces in the filenames valid.)
const IDEAL_REFERENCE = {
  front: encodeURI('/report/WhatsApp Image 2026-08-17 at 10.28.34 PM.jpeg'),
  left: encodeURI('/report/WhatsApp Image 2026-08-17 at 10.28.34 PM (1).jpeg'),
  right: encodeURI('/report/WhatsApp Image 2026-08-17 at 10.28.34 PM (2).jpeg'),
};

// Choose the reference illustration for a finding. Front/back use the frontal
// view; side views pick the left- or right-facing profile from the assessment
// id/name (e.g. "full_body_left" → left profile), defaulting to left.
function idealReferenceFor(assessment: ClinicalAssessment): string {
  if (assessment.view !== 'side') return IDEAL_REFERENCE.front;
  const tag = `${assessment.id} ${assessment.name}`.toLowerCase();
  if (tag.includes('right')) return IDEAL_REFERENCE.right;
  return IDEAL_REFERENCE.left;
}

export default function ClinicalReport({ patient, captures, extraShots = [], onRestart, restartLabel, notesSection, doctorMode = false, doctorData, onDoctorDataChange, shareUrl, idealPostures = [] }: Props) {
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

  // The reference-image "dictionary" for the manual "Select image" control on
  // non-default findings. Kept grouped by section/condition (Shoulder, Neck, …)
  // exactly like the doctor's Ideal Posture Library, so the picker can open as a
  // sectioned dictionary. Seed from the ideal-posture sets already on this
  // report, then fetch the FULL doctor-panel library so every curated section is
  // available — not just the ones auto-matched to the patient's pain areas.
  const [librarySets, setLibrarySets] = useState<IdealPostureSet[]>(() => idealPostures);
  useEffect(() => {
    let cancelled = false;
    listIdealPostures()
      .then(({ sets }) => {
        if (!cancelled && sets.length) setLibrarySets(sets);
      })
      .catch(() => {
        /* keep the seeded subset */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Add an uploaded image into one dictionary section and persist it to the
  // shared clinic library (doctor/admin only — the API enforces the role). The
  // grouped state is updated so every open picker in this report reflects it.
  const addImageToLibrary = async (condition: string, image: IdealPostureImage) => {
    const existing = librarySets.find((s) => s.condition === condition);
    const nextImages = [...(existing?.images ?? []), image];
    await saveIdealPosture(condition, nextImages, existing?.poses ?? []);
    setLibrarySets((prev) =>
      prev.some((s) => s.condition === condition)
        ? prev.map((s) => (s.condition === condition ? { ...s, images: nextImages } : s))
        : [...prev, { condition, images: nextImages, poses: [] }]
    );
  };

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
                          idealPostures={idealPostures}
                          librarySets={librarySets}
                          onAddToLibrary={addImageToLibrary}
                          canEditLibrary={doctorMode}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Doctor-curated ideal reference postures for this patient's pain areas.
              Auto-populated from the clinic's ideal-posture library at report time. */}
          {idealPostures.some((s) => s.images.length > 0) && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Ideal Reference Postures
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Target postures for the patient's condition — compare against the captured photos above.
              </p>
              <div className="space-y-5">
                {idealPostures
                  .filter((s) => s.images.length > 0)
                  .map((set) => (
                    <div key={set.condition} className="break-inside-avoid">
                      <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-emerald-600 rounded-sm" /> {set.condition}
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {set.images.map((img, i) => (
                          <figure
                            key={i}
                            className="rounded-lg overflow-hidden border border-emerald-100 bg-emerald-50/40 break-inside-avoid"
                          >
                            <ZoomableImage
                              src={img.imageData}
                              alt={img.label || `${set.condition} ideal posture ${i + 1}`}
                              heightClass="h-44"
                              badge="Ideal"
                            />
                            {img.label && (
                              <figcaption className="px-2 py-1 text-[11px] text-emerald-800 bg-emerald-50 truncate">
                                {img.label}
                              </figcaption>
                            )}
                          </figure>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          )}

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

// Pick the best curated "ideal" reference image to show beside a finding's
// patient photo: first a library set that tracks this exact capture pose, else
// one whose condition matches the finding's pain area / body region. Returns
// null when nothing matches, so the caller falls back to the plumb illustration.
function pickIdealImage(
  assessment: ClinicalAssessment,
  sets: IdealPostureSet[]
): { imageData: string; label: string } | null {
  if (!sets || sets.length === 0) return null;
  const norm = (s?: string) => (s || '').toLowerCase().trim();
  let match = sets.find(
    (s) => Array.isArray(s.poses) && s.poses.includes(assessment.id) && s.images.length > 0
  );
  if (!match) {
    const keys = [norm(assessment.painArea), norm(assessment.bodyRegion)];
    match = sets.find((s) => s.images.length > 0 && keys.includes(norm(s.condition)));
  }
  return match ? match.images[0] : null;
}

function FindingCard({
  capture,
  assessment,
  doctorMode,
  initialDoctorData,
  onDoctorDataChange,
  idealPostures = [],
  librarySets = [],
  onAddToLibrary,
  canEditLibrary = false,
}: {
  capture: AssessmentCapture;
  assessment: ClinicalAssessment;
  doctorMode: boolean;
  initialDoctorData?: DoctorFindingData;
  onDoctorDataChange?: (assessmentId: string, data: DoctorFindingData) => void;
  idealPostures?: IdealPostureSet[];
  /** Full doctor-panel reference library, grouped by section, offered as a
      sectioned "dictionary" in the manual "Select image" control. */
  librarySets?: IdealPostureSet[];
  /** Persist a new image into a library section (doctor/admin). */
  onAddToLibrary?: (condition: string, image: IdealPostureImage) => Promise<void>;
  /** Whether the current user may add images to the shared library. */
  canEditLibrary?: boolean;
}) {
  const idealImage = pickIdealImage(assessment, idealPostures);
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
      <div className="flex flex-col">
        {/* Media row — LEFT: patient's captured photo with the AI pose overlay
            baked in. RIGHT: the doctor-curated ideal reference image for this
            condition (falls back to the plumb illustration when the library has
            none). Both are equal, full-width halves shown large so the patient
            can clearly compare their posture against the ideal. Photos use
            object-contain with a blurred backdrop, so the FULL body / every
            measured point stays visible and the frame never looks empty. */}
        <div className="grid grid-cols-2 w-full bg-slate-900">
          <figure className="relative border-r border-white/10">
            <ZoomableImage
              src={capture.imageData || capture.rawImageData}
              alt={`${assessment.name} — patient photo with pose points`}
              heightClass="h-80 sm:h-96"
              badge="You · pose points"
            />
          </figure>
          <figure className="relative">
            {assessment.defaultSelected ? (
              /* The four default full-body poses (front / back / left / right)
                 get their fixed /public/report reference illustration — no
                 manual picker. A curated library image for the exact condition,
                 if any, still takes precedence. */
              <ZoomableImage
                src={idealImage ? idealImage.imageData : idealReferenceFor(assessment)}
                alt={idealImage?.label || `${assessment.name} — ideal position`}
                heightClass="h-80 sm:h-96"
                badge={idealImage?.label ? `Ideal · ${idealImage.label}` : 'Ideal Position'}
                variant="reference"
              />
            ) : (
              /* Every other selected finding (shoulder, neck, …) has no default
                 reference — the column stays blank until an image is chosen by
                 hand, from the ideal-posture library or the device. */
              <ManualIdealPicker
                librarySets={librarySets}
                onAddToLibrary={onAddToLibrary}
                canEdit={canEditLibrary}
              />
            )}
          </figure>
        </div>
        <div className="p-4 border-t border-gray-100">
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

// Downscale an uploaded image and re-encode as JPEG so images saved into the
// shared library stay small (they get baked into reports). Mirrors the helper
// used by the doctor's Ideal Posture Library.
function fileToLibraryDataUrl(file: File, maxPx = 900, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Reference column for a non-default finding (shoulder, neck, …). Starts blank
 * with a "Select image" control — no auto/default illustration. Clicking it
 * opens a sectioned "dictionary" (the clinic's ideal-posture library grouped by
 * body area). The doctor picks the section (Shoulder, Neck, …), chooses one of
 * the reference images, and can also add new images into a section — which are
 * saved back into the shared library so they appear everywhere. The picked
 * image itself is local to this report view.
 */
function ManualIdealPicker({
  librarySets,
  onAddToLibrary,
  canEdit,
}: {
  librarySets: IdealPostureSet[];
  onAddToLibrary?: (condition: string, image: IdealPostureImage) => Promise<void>;
  canEdit: boolean;
}) {
  const [picked, setPicked] = useState<{ src: string; label?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const oneOffRef = useRef<HTMLInputElement>(null);

  const onOneOffFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPicked({ src: reader.result as string, label: file.name });
      setOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (picked) {
    return (
      <div className="relative">
        <ZoomableImage
          src={picked.src}
          alt={picked.label || 'Selected reference'}
          heightClass="h-80 sm:h-96"
          badge={picked.label ? `Ideal · ${picked.label}` : 'Ideal Position'}
          variant="reference"
        />
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="absolute z-30 top-1 left-1 rounded bg-black/60 hover:bg-black/80 text-white text-[10px] font-semibold px-1.5 py-0.5 print:hidden"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-80 sm:h-96 flex-col items-center justify-center bg-slate-50 p-4 print:hidden">
      <input ref={oneOffRef} type="file" accept="image/*" onChange={onOneOffFile} className="hidden" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 shadow-sm"
      >
        <ImagePlus className="w-4 h-4" /> Select image
      </button>
      <p className="mt-2 text-[11px] text-slate-400">Ideal reference (optional)</p>

      {open && (
        <ReferenceDictionary
          librarySets={librarySets}
          canEdit={canEdit}
          onAddToLibrary={onAddToLibrary}
          onUploadOneOff={() => oneOffRef.current?.click()}
          onPick={(src, label) => {
            setPicked({ src, label });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Full-screen "dictionary" of reference images, organised into sections by body
 * area — the same library the doctor curates on the Ideal Posture page. Lets the
 * user browse a section, pick an image for the report, add new images into a
 * section (persisted to the shared library), or start a whole new section.
 */
function ReferenceDictionary({
  librarySets,
  canEdit,
  onAddToLibrary,
  onUploadOneOff,
  onPick,
  onClose,
}: {
  librarySets: IdealPostureSet[];
  canEdit: boolean;
  onAddToLibrary?: (condition: string, image: IdealPostureImage) => Promise<void>;
  onUploadOneOff: () => void;
  onPick: (src: string, label?: string) => void;
  onClose: () => void;
}) {
  // Sections = the built-in body areas plus any custom ones already in the
  // library, plus any the user creates this session.
  const [extraSections, setExtraSections] = useState<string[]>([]);
  const sections = Array.from(
    new Set<string>([
      ...IDEAL_POSTURE_CONDITIONS,
      ...librarySets.map((s) => s.condition),
      ...extraSections,
    ])
  );
  const [active, setActive] = useState<string>(sections[0] ?? 'Shoulder');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addRef = useRef<HTMLInputElement>(null);

  const activeImages = librarySets.find((s) => s.condition === active)?.images ?? [];

  const addNewSection = () => {
    const name = window.prompt('New section name (e.g. Wrist, Full Body)')?.trim();
    if (!name) return;
    const existing = sections.find((s) => s.toLowerCase() === name.toLowerCase());
    if (existing) {
      setActive(existing);
      return;
    }
    setExtraSections((prev) => [...prev, name]);
    setActive(name);
  };

  const onAddFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !onAddToLibrary) return;
    setError('');
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const imageData = await fileToLibraryDataUrl(file);
        await onAddToLibrary(active, { label: '', imageData });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add image');
    } finally {
      setBusy(false);
      if (addRef.current) addRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Reference Image Library</h3>
            <p className="text-[11px] text-slate-400">Pick a section, then choose a reference image.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
          {sections.map((s) => {
            const count = librarySets.find((set) => set.condition === s)?.images.length ?? 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setActive(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active === s
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] ${active === s ? 'text-white/80' : 'text-emerald-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {canEdit && (
            <button
              type="button"
              onClick={addNewSection}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-emerald-300 bg-emerald-50/60 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
            >
              <FolderPlus className="w-3.5 h-3.5" /> New section
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>
          )}
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {active} · {activeImages.length} image{activeImages.length === 1 ? '' : 's'}
            </span>
            {canEdit && onAddToLibrary && (
              <label
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 ${
                  busy ? 'pointer-events-none opacity-50' : ''
                }`}
                title={`Add images to ${active}`}
              >
                <Upload className="w-3.5 h-3.5" /> {busy ? 'Adding…' : `Add to ${active}`}
                <input
                  ref={addRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => onAddFiles(e.target.files)}
                />
              </label>
            )}
          </div>

          {activeImages.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-12 text-center text-slate-400">
              <ImageIcon className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm">No reference images in {active} yet.</p>
              {canEdit && onAddToLibrary && (
                <button
                  type="button"
                  onClick={() => addRef.current?.click()}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add the first image
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {activeImages.map((im, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onPick(im.imageData, im.label || active)}
                  className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:ring-2 hover:ring-emerald-400"
                  title={im.label || `${active} ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={im.imageData}
                    alt={im.label || `${active} reference ${i + 1}`}
                    className="h-full w-full object-contain"
                  />
                  {im.label && (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                      {im.label}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — one-off upload straight into this report (not saved to library) */}
        <div className="border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onUploadOneOff}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            <ImagePlus className="w-3.5 h-3.5" /> Or upload a one-off image from computer
          </button>
        </div>
      </div>
    </div>
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
  variant = 'photo',
}: {
  src?: string;
  alt: string;
  heightClass?: string;
  badge?: string;
  /** 'photo' — dark backdrop + blurred fill (patient captures). 'reference' —
      clean white backdrop, no blur (line-drawing / illustration references so
      their white background blends and the figure shows crisply). */
  variant?: 'photo' | 'reference';
}) {
  const [zoom, setZoom] = useState(false);
  const isReference = variant === 'reference';
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
        className={`group relative block w-full ${heightClass} cursor-zoom-in overflow-hidden ${isReference ? 'bg-white' : 'bg-slate-900'} print:cursor-default`}
        aria-label={`View ${alt} full size`}
      >
        {/* Blurred, cover-sized copy of the same photo fills the empty margins so
            portrait/landscape shots look full and attractive without ever
            cropping the measured image in front (which stays object-contain).
            Skipped for clean illustration references. */}
        {!isReference && (
          <img
            src={src}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-40 print:hidden"
          />
        )}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`relative z-10 w-full h-full object-contain ${isReference ? 'p-3' : ''}`}
        />
        {badge && (
          <span className="absolute z-20 bottom-1 left-1 text-[10px] font-semibold bg-black/70 text-white px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
        <span className="absolute z-20 top-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
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
