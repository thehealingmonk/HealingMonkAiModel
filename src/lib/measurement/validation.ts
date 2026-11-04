/**
 * Measurement validation shared by both AI modules: robust multi-frame
 * aggregation, cross-source comparison and plausibility checks.
 *
 * Rules (never relaxed to make results "look" better):
 *  - Disagreeing values are NEVER averaged or silently replaced; the caller gets
 *    a `mismatch` and must ask the user which one is right (or re-measure).
 *  - The higher/newer value is never auto-selected.
 *  - Tolerances come from the stated uncertainties of both values, so a precise
 *    pair is held to a tight bound and a rough pair to a looser one.
 */

import { CALIBRATION_RANK, MeasurementRecord, ValidationStatus } from './schema';

// ---------------------------------------------------------------------------
//  Multi-frame aggregation
// ---------------------------------------------------------------------------

export interface RobustStats {
  /** Median of the finite samples (null when there are none). */
  median: number | null;
  /** Median absolute deviation × 1.4826 (≈ standard deviation for normal noise). */
  spread: number | null;
  /** Number of finite samples used. */
  n: number;
}

export function robustStats(values: (number | null | undefined)[]): RobustStats {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return { median: null, spread: null, n: 0 };
  const med = medianSorted(xs);
  const dev = xs.map((x) => Math.abs(x - med)).sort((a, b) => a - b);
  return { median: med, spread: medianSorted(dev) * 1.4826, n: xs.length };
}

function medianSorted(xs: number[]): number {
  const m = xs.length >> 1;
  return xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
}

export interface FrameAggregate {
  value: number | null;
  spread: number | null;
  frames: number;
  /** true when enough frames agree closely enough to trust the value. */
  stable: boolean;
  issues: string[];
}

/**
 * Turn the per-frame values of the last ~second into one capture value.
 *
 * @param minFrames  frames with a valid value required (default 5)
 * @param maxSpread  largest acceptable spread in the value's unit (default 3°)
 */
export function aggregateFrames(
  values: (number | null | undefined)[],
  minFrames = 5,
  maxSpread = 3
): FrameAggregate {
  const s = robustStats(values);
  const issues: string[] = [];
  if (s.n < minFrames) issues.push(`Only ${s.n} of the last ${values.length} frames had the required body points visible`);
  if (s.spread != null && s.spread > maxSpread) issues.push(`Value varied by ±${round1(s.spread)} between frames — the patient was moving`);
  return {
    value: s.median == null ? null : round1(s.median),
    spread: s.spread == null ? null : round1(s.spread),
    frames: s.n,
    stable: s.n >= minFrames && (s.spread ?? Infinity) <= maxSpread,
    issues,
  };
}

// ---------------------------------------------------------------------------
//  Cross-source comparison
// ---------------------------------------------------------------------------

export interface Comparison {
  status: Extract<ValidationStatus, 'valid' | 'mismatch' | 'rejected'>;
  /** |a − b| in the records' unit (null if either is missing). */
  difference: number | null;
  /** Largest difference that still counts as agreement. */
  tolerance: number | null;
  /** The record judged less reliable when they disagree (by calibration, then uncertainty). */
  lessReliable: MeasurementRecord | null;
  message: string;
}

/**
 * Compare two measurements of the same physical quantity.
 *
 * Tolerance = k · √(u₁² + u₂²) with a floor, where u is each record's stated
 * uncertainty (missing uncertainty falls back to `defaultUncertainty`). k = 2
 * ≈ 95 % agreement band for independent errors.
 */
export function compareMeasurements(
  a: MeasurementRecord,
  b: MeasurementRecord,
  opts: { k?: number; floor?: number; defaultUncertainty?: number } = {}
): Comparison {
  const k = opts.k ?? 2;
  const floor = opts.floor ?? 1;
  const du = opts.defaultUncertainty ?? 2;
  if (a.unit !== b.unit) {
    return { status: 'rejected', difference: null, tolerance: null, lessReliable: null, message: `Unit mismatch (${a.unit} vs ${b.unit}) — cannot compare` };
  }
  if (a.value == null || b.value == null) {
    return { status: 'rejected', difference: null, tolerance: null, lessReliable: null, message: 'One of the values is missing — cannot compare' };
  }
  const diff = Math.abs(a.value - b.value);
  const tol = Math.max(floor, k * Math.hypot(a.uncertainty ?? du, b.uncertainty ?? du));
  if (diff <= tol) {
    return { status: 'valid', difference: round1(diff), tolerance: round1(tol), lessReliable: null, message: 'Values agree' };
  }
  const lessReliable = pickLessReliable(a, b);
  return {
    status: 'mismatch',
    difference: round1(diff),
    tolerance: round1(tol),
    lessReliable,
    message: `${a.name}: ${fmt(a)} and ${fmt(b)} differ by ${round1(diff)} ${a.unit} (allowed ±${round1(tol)}). Re-measure, or choose which value is correct.`,
  };
}

function pickLessReliable(a: MeasurementRecord, b: MeasurementRecord): MeasurementRecord {
  const ra = CALIBRATION_RANK[a.calibration];
  const rb = CALIBRATION_RANK[b.calibration];
  if (ra !== rb) return ra < rb ? a : b;
  return (a.uncertainty ?? Infinity) >= (b.uncertainty ?? Infinity) ? a : b;
}

const fmt = (r: MeasurementRecord) => `${r.value} ${r.unit} (${r.source})`;
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
//  Plausibility against body proportions
// ---------------------------------------------------------------------------

/**
 * Biacromial (shoulder) breadth as a fraction of stature. Population mean is
 * ≈ 0.23 (Pheasant); individual adults fall roughly within 0.19–0.27. Outside
 * that band the measurement is far more likely a tap / scale error than a real
 * body — so it is flagged, not silently accepted.
 */
export const SHOULDER_RATIO_MIN = 0.19;
export const SHOULDER_RATIO_MAX = 0.27;

export function checkShoulderVsStature(
  shoulderCm: number,
  statureCm: number | null
): { status: 'valid' | 'warning'; message: string } {
  if (statureCm == null || !(statureCm > 0)) return { status: 'valid', message: '' };
  const ratio = shoulderCm / statureCm;
  if (ratio < SHOULDER_RATIO_MIN || ratio > SHOULDER_RATIO_MAX) {
    const lo = Math.round(statureCm * SHOULDER_RATIO_MIN);
    const hi = Math.round(statureCm * SHOULDER_RATIO_MAX);
    return {
      status: 'warning',
      message: `Shoulder width ${shoulderCm} cm is unusual for a height of ${statureCm} cm (expected about ${lo}–${hi} cm). Check the reference distance and the tapped points.`,
    };
  }
  return { status: 'valid', message: '' };
}
