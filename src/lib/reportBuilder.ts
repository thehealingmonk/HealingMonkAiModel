// Turns the AI assessment captures into the persisted report payload.
// Mirrors the scoring shown in ClinicalReport so the saved report matches
// what the doctor sees on screen.

import { AssessmentCapture, getAssessment, Severity } from '@/lib/clinicalKnowledge';
import { ReportFinding, ReportExercise, NewReport } from '@/services/api';

const SEVERITY_SCORE: Record<Severity, number> = { normal: 0, mild: 1, moderate: 2, severe: 3 };

export function buildReportPayload(
  patientDbId: string,
  captures: AssessmentCapture[],
  painAreas: string[]
): NewReport {
  const paired = captures
    .map((c) => ({ capture: c, assessment: getAssessment(c.assessmentId) }))
    .filter((p): p is { capture: AssessmentCapture; assessment: NonNullable<ReturnType<typeof getAssessment>> } =>
      Boolean(p.assessment)
    );

  const findings: ReportFinding[] = paired.map(({ capture, assessment }) => ({
    assessmentId: assessment.id,
    name: assessment.name,
    bodyRegion: assessment.bodyRegion,
    measurementName: assessment.measurementName,
    value: capture.value,
    unit: assessment.unit,
    severity: capture.severity,
    painArea: assessment.painArea,
    painCorrelation: assessment.painCorrelation,
    ...(capture.quality
      ? {
          reliability: {
            frames: capture.quality.frames,
            spread: capture.quality.spread,
            stable: capture.quality.stable,
            landmarkConfidence: capture.quality.landmarkConfidence,
            issues: capture.quality.issues.slice(0, 10),
          },
        }
      : {}),
  }));

  const totalPenalty = paired.reduce(
    (sum, p) => sum + (p.capture.severity ? SEVERITY_SCORE[p.capture.severity] : 0),
    0
  );
  const maxPenalty = paired.length * 3 || 1;
  const overallScore = Math.max(0, Math.round(100 - (totalPenalty / maxPenalty) * 100));

  // Recommend exercises only for flagged (non-normal) findings.
  const suggestedExercises: ReportExercise[] = [];
  for (const { capture, assessment } of paired) {
    if (capture.severity && capture.severity !== 'normal') {
      for (const ex of assessment.exercises) {
        suggestedExercises.push({ ...ex, forFinding: assessment.name });
      }
    }
  }

  return {
    patientId: patientDbId,
    painAreas,
    overallScore,
    findings,
    suggestedExercises,
  };
}
