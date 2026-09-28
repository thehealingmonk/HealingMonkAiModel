/**
 * ErgoAI catalog: environments, tasks, method routing, risk-band colours, and
 * the default manual inputs. Mirrors the style of SEVERITY_COLOR in
 * `@/lib/clinicalKnowledge` so the UI feels consistent.
 */

import {
  ErgoEnvironment,
  ErgoTask,
  ErgoMethod,
  ErgoManualInputs,
  RiskBand,
  ErgoObjectType,
  MeasurementMode,
  FindingConfidence,
} from './ergoTypes';

export const ENVIRONMENTS: { id: ErgoEnvironment; label: string; hint: string }[] = [
  { id: 'office', label: 'IT / Office', hint: 'Desk & computer workstations' },
  { id: 'manufacturing', label: 'Manufacturing', hint: 'Assembly lines, machine operation' },
  { id: 'warehouse', label: 'Warehouse', hint: 'Loading, storage, material handling' },
  { id: 'laboratory', label: 'Laboratory', hint: 'Bench work, microscopes' },
  { id: 'healthcare', label: 'Healthcare', hint: 'Patient handling, clinical tasks' },
  { id: 'other', label: 'Other', hint: 'Custom environment' },
];

export const TASKS: { id: ErgoTask; label: string; hint: string }[] = [
  { id: 'computer', label: 'Computer work', hint: 'Seated desk / VDU work' },
  { id: 'assembly', label: 'Assembly', hint: 'Repetitive hand assembly' },
  { id: 'machine', label: 'Machine operation', hint: 'Operating equipment / presses' },
  { id: 'lifting', label: 'Lifting', hint: 'Lifting loads from/to height' },
  { id: 'material-handling', label: 'Material handling', hint: 'Carrying, pushing, pulling' },
  { id: 'packing', label: 'Packing', hint: 'Packing / picking tasks' },
  { id: 'other', label: 'Other', hint: 'Custom task' },
];

/**
 * Method routing. Office computer work → RULA (upper-limb focus). Standing /
 * whole-body industrial work → REBA. Anything that involves lifting or manual
 * material handling → also run the NIOSH lifting equation.
 */
export function methodsForTask(env: ErgoEnvironment, task: ErgoTask): ErgoMethod[] {
  const methods = new Set<ErgoMethod>();

  if (task === 'computer' || env === 'office') {
    methods.add('RULA');
  } else {
    methods.add('REBA');
  }

  if (task === 'lifting' || task === 'material-handling') {
    methods.add('NIOSH');
    // Whole-body posture matters for lifting too.
    methods.add('REBA');
  }

  // Assembly / packing at a bench can be either — REBA gives the whole-body
  // picture, RULA the arm/wrist detail. Default to REBA for standing tasks.
  return Array.from(methods);
}

/** Whether this task needs the NIOSH manual-lift fields shown in the inputs step. */
export function taskNeedsLiftInputs(task: ErgoTask): boolean {
  return task === 'lifting' || task === 'material-handling';
}

export const RISK_COLOR: Record<RiskBand, string> = {
  negligible: '#22c55e', // green
  low: '#84cc16', // lime
  medium: '#eab308', // amber
  high: '#f97316', // orange
  'very-high': '#ef4444', // red
};

export const RISK_LABEL: Record<RiskBand, string> = {
  negligible: 'Negligible risk',
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  'very-high': 'Very high risk',
};

export const RISK_EMOJI: Record<RiskBand, string> = {
  negligible: '🟢',
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  'very-high': '🔴',
};

/** Ordered worst-first so we can compute "the worst band across N results". */
const BAND_ORDER: RiskBand[] = ['negligible', 'low', 'medium', 'high', 'very-high'];

export function bandRank(b: RiskBand): number {
  return BAND_ORDER.indexOf(b);
}

export function worseBand(a: RiskBand, b: RiskBand): RiskBand {
  return bandRank(a) >= bandRank(b) ? a : b;
}

// ===========================================================================
//  Workplace layer catalog (object detection + measurement provenance). All
//  additive — nothing above changed.
// ===========================================================================

/**
 * Map the raw COCO labels the EfficientDet detector emits onto our workplace
 * object vocabulary. Anything not listed is treated as `unknown` so we never
 * claim an object we can't confidently identify (spec §3/§27).
 */
export const COCO_TO_ERGO: Record<string, { type: ErgoObjectType; label: string }> = {
  person: { type: 'person', label: 'Person' },
  chair: { type: 'chair', label: 'Chair' },
  couch: { type: 'chair', label: 'Seat' },
  bench: { type: 'chair', label: 'Bench' },
  'dining table': { type: 'desk', label: 'Desk' },
  desk: { type: 'desk', label: 'Desk' },
  tv: { type: 'monitor', label: 'Monitor' },
  laptop: { type: 'laptop', label: 'Laptop' },
  keyboard: { type: 'keyboard', label: 'Keyboard' },
  mouse: { type: 'mouse', label: 'Mouse' },
  'cell phone': { type: 'phone', label: 'Phone' },
};

/** Human-readable name for an object type (used in inspection UI). */
export const OBJECT_LABEL: Record<ErgoObjectType, string> = {
  person: 'Person',
  chair: 'Chair',
  desk: 'Desk',
  monitor: 'Monitor',
  laptop: 'Laptop',
  keyboard: 'Keyboard',
  mouse: 'Mouse',
  footrest: 'Footrest',
  phone: 'Phone',
  unknown: 'Object',
};

/** Detector score → coarse confidence label for the scan overlay. */
export function scoreConfidence(score: number): FindingConfidence {
  if (score >= 0.6) return 'high';
  if (score >= 0.4) return 'medium';
  if (score > 0) return 'low';
  return 'unable';
}

export const CONFIDENCE_LABEL: Record<FindingConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  unable: 'Unable to determine',
};

export const CONFIDENCE_COLOR: Record<FindingConfidence, string> = {
  high: '#22c55e',
  medium: '#eab308',
  low: '#f97316',
  unable: '#94a3b8',
};

export const MEASUREMENT_MODE_LABEL: Record<MeasurementMode, string> = {
  'user-measured': 'User measured',
  calibrated: 'Calibrated estimate',
  estimated: 'Estimated',
  unknown: 'Unknown',
};

/** Neutral defaults so a report can be produced from posture alone. */
export const defaultManualInputs: ErgoManualInputs = {
  loadKg: 0,
  loadStatic: false,
  shockOrRapid: false,
  coupling: 'good',
  actionsPerMinute: 2,
  durationHoursPerDay: 4,
  trunkTwisted: false,
  neckTwisted: false,
  horizontalCm: 25,
  verticalCm: 75,
  travelCm: 25,
  asymmetryDeg: 0,
  liftsPerMinute: 1,
};
