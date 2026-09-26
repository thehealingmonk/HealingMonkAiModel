/**
 * ErgoAI engine — turns camera angles + manual inputs into a single, merged
 * ergonomic risk result. It selects the applicable standards for the task,
 * runs them, and synthesises a category breakdown, primary risk factors and a
 * prioritised corrective-action plan.
 */

import {
  ErgoEnvironment,
  ErgoTask,
  ErgoAngles,
  ErgoManualInputs,
  ErgoResult,
  ErgoCategoryRisk,
  ErgoRecommendation,
  ErgoSegment,
  RiskBand,
} from './ergoTypes';
import { methodsForTask, worseBand, bandRank } from './ergoKnowledge';
import { computeRula } from './rula';
import { computeReba } from './reba';
import { computeNiosh } from './niosh';

/** Map a REBA-style 1..N sub-score to a coarse risk band for a single category. */
function scoreBand(score: number, max: number): RiskBand {
  const r = score / max;
  if (r <= 0.25) return 'negligible';
  if (r <= 0.45) return 'low';
  if (r <= 0.65) return 'medium';
  if (r <= 0.85) return 'high';
  return 'very-high';
}

/**
 * Assess ergonomics for one worker/task. `sideAngles` (sagittal) is preferred for
 * trunk/neck/arm flexion; `frontAngles` (coronal) adds side-bend / abduction when
 * available. Either may be null; at least one should be provided.
 */
export function assessErgonomics(
  environment: ErgoEnvironment,
  task: ErgoTask,
  sideAngles: ErgoAngles | null,
  frontAngles: ErgoAngles | null,
  manual: ErgoManualInputs
): ErgoResult {
  const methods = methodsForTask(environment, task);

  // Prefer side view for the flexion-driven scores; fall back to whatever exists.
  const primary = sideAngles ?? frontAngles;
  if (!primary) throw new Error('assessErgonomics needs at least one captured pose');

  // Merge the two views so front-only quantities (side-bend, abduction) enrich
  // the side-view frame that drives the scorers.
  const merged: ErgoAngles = { ...primary };
  if (frontAngles) {
    merged.neckSideBend = frontAngles.neckSideBend ?? merged.neckSideBend;
    merged.trunkSideBend = frontAngles.trunkSideBend ?? merged.trunkSideBend;
    merged.shoulderAbduction = frontAngles.shoulderAbduction ?? merged.shoulderAbduction;
    merged.shoulderRaised = merged.shoulderRaised || frontAngles.shoulderRaised;
  }

  const rula = methods.includes('RULA') ? computeRula(merged, manual) : undefined;
  const reba = methods.includes('REBA') ? computeReba(merged, manual) : undefined;
  const niosh = methods.includes('NIOSH') ? computeNiosh(manual) : undefined;

  // Overall band = worst across all applicable methods.
  let overall: RiskBand = 'negligible';
  for (const b of [rula?.band, reba?.band, niosh?.band]) if (b) overall = worseBand(overall, b);

  // A single comparable 0–100 (higher = worse), from the dominant score.
  const overallScore = Math.round((bandRank(overall) / 4) * 100);

  // ---- Category breakdown ----
  const categories: ErgoCategoryRisk[] = [];
  // Posture: from REBA table-A/table-B or RULA grand.
  if (reba) {
    categories.push({
      category: 'Posture',
      band: scoreBand(reba.grandScore, 15),
      detail: `REBA score ${reba.grandScore}/15 (${reba.message})`,
    });
  } else if (rula) {
    categories.push({
      category: 'Posture',
      band: scoreBand(rula.grandScore, 7),
      detail: `RULA score ${rula.grandScore}/7 (${rula.message})`,
    });
  }
  // Force / load.
  categories.push({
    category: 'Force / Load',
    band:
      manual.loadKg <= 0
        ? 'negligible'
        : manual.loadKg < 5
        ? 'low'
        : manual.loadKg <= 10
        ? 'medium'
        : manual.loadKg <= 20
        ? 'high'
        : 'very-high',
    detail:
      manual.loadKg <= 0
        ? 'No external load recorded.'
        : `Handling ${manual.loadKg} kg${manual.shockOrRapid ? ' with sudden/jerky force' : ''}.`,
  });
  // Repetition.
  categories.push({
    category: 'Repetition',
    band:
      manual.actionsPerMinute <= 2
        ? 'negligible'
        : manual.actionsPerMinute <= 4
        ? 'low'
        : manual.actionsPerMinute <= 8
        ? 'medium'
        : manual.actionsPerMinute <= 12
        ? 'high'
        : 'very-high',
    detail: `${manual.actionsPerMinute} actions/min.`,
  });
  // Duration.
  categories.push({
    category: 'Duration',
    band:
      manual.durationHoursPerDay <= 1
        ? 'negligible'
        : manual.durationHoursPerDay <= 2
        ? 'low'
        : manual.durationHoursPerDay <= 4
        ? 'medium'
        : manual.durationHoursPerDay <= 6
        ? 'high'
        : 'very-high',
    detail: `${manual.durationHoursPerDay} h/day in this task/posture.`,
  });
  // Recovery (inverse of duration + static holding).
  categories.push({
    category: 'Recovery',
    band: manual.loadStatic && manual.durationHoursPerDay >= 4 ? 'high' : manual.durationHoursPerDay >= 6 ? 'medium' : 'low',
    detail: manual.loadStatic ? 'Static/sustained holding reduces recovery.' : 'Some natural recovery between actions.',
  });

  // ---- Primary risk factors (the categories that are medium+). ----
  const primaryFactors: string[] = [];
  if ((merged.trunkFlexion ?? 0) > 20) primaryFactors.push('Excessive trunk flexion (forward bending)');
  if ((merged.neckFlexion ?? 0) > 20) primaryFactors.push('Excessive neck flexion');
  if ((merged.upperArmElevation ?? 0) > 45) primaryFactors.push('Raised / reaching upper arm');
  if (manual.trunkTwisted) primaryFactors.push('Trunk twisting');
  if (manual.loadKg > 10) primaryFactors.push(`Heavy load (${manual.loadKg} kg)`);
  if (manual.actionsPerMinute > 8) primaryFactors.push('High repetition rate');
  if (manual.durationHoursPerDay > 4) primaryFactors.push('Long exposure duration');
  if (niosh && niosh.liftingIndex > 1) primaryFactors.push(`Lifting Index ${niosh.liftingIndex} (> 1)`);
  if (primaryFactors.length === 0) primaryFactors.push('No dominant risk factor — posture within acceptable ranges');

  // ---- Recommendations, prioritised. ----
  const recommendations: ErgoRecommendation[] = [];
  if ((merged.trunkFlexion ?? 0) > 20)
    recommendations.push({ priority: 1, text: 'Raise the work surface / bring work closer so the trunk stays upright.' });
  if ((merged.neckFlexion ?? 0) > 20)
    recommendations.push({ priority: 1, text: 'Raise the display/work to eye level to reduce neck flexion.' });
  if ((merged.upperArmElevation ?? 0) > 45)
    recommendations.push({ priority: 1, text: 'Reduce reach distance; relocate frequently used items into the neutral zone.' });
  if (niosh && niosh.liftingIndex > 1)
    recommendations.push({ priority: 1, text: 'Redesign the lift: reduce load, keep it close, avoid twisting, or add mechanical aids.' });
  if (manual.trunkTwisted)
    recommendations.push({ priority: 2, text: 'Reorient the layout so the worker faces the load — eliminate twisting.' });
  if (manual.actionsPerMinute > 8 || manual.loadStatic)
    recommendations.push({ priority: 2, text: 'Introduce task rotation / micro-breaks to reduce repetition and static load.' });
  if (manual.coupling === 'poor' || manual.coupling === 'unacceptable')
    recommendations.push({ priority: 2, text: 'Improve grip: add handles / better couplings on the load.' });
  recommendations.push({ priority: 3, text: 'Reassess this workstation after implementing changes (e.g. in 30 days).' });

  // ---- Worst segment for the live overlay (highest REBA sub-score). ----
  let worstSegment: ErgoSegment | null = null;
  if (reba && reba.segments.length) {
    worstSegment = reba.segments.reduce((a, b) => (b.score > a.score ? b : a)).segment;
  }

  return {
    environment,
    task,
    methods,
    rula,
    reba,
    niosh,
    overall,
    overallScore,
    categories,
    primaryFactors,
    recommendations: recommendations.sort((a, b) => a.priority - b.priority),
    worstSegment,
    confidence: merged.confidence,
    generatedAt: Date.now(),
  };
}
