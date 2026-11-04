/**
 * Common measurement schema shared by both AI modules:
 *   - "clinical" — the full-body posture scan (angles in degrees)
 *   - "ergo"     — ErgoAI height / width / body-dimension measurement (cm)
 *
 * Every number either module reports can be expressed as a MeasurementRecord so
 * it carries its unit, how it was obtained (calibration status), how sure we are
 * (confidence + ± uncertainty) and whether it passed validation. Nothing here
 * invents a value: a record without a trustworthy value has `value: null`.
 */

export type MeasurementUnit = 'cm' | 'deg' | 'pct' | 'ratio';

export type MeasurementSource = 'clinical' | 'ergo-live' | 'ergo-photo' | 'ergo-ar' | 'user' | 'population';

/**
 * How the value was obtained, best first:
 *  - user-measured : typed from a tape measure / known value
 *  - calibrated    : derived from a known-size reference in the same plane, or AR
 *  - estimated     : pixel geometry with assumed scale (camera FOV, body ratios)
 *  - unavailable   : could not be measured
 */
export type CalibrationStatus = 'user-measured' | 'calibrated' | 'estimated' | 'unavailable';

/**
 *  - valid     : passed every check
 *  - warning   : usable but flagged (e.g. unusual vs. body proportions, unsteady)
 *  - mismatch  : disagrees with another source beyond tolerance — needs a decision
 *  - rejected  : failed validation; must not be used
 */
export type ValidationStatus = 'valid' | 'warning' | 'mismatch' | 'rejected';

export interface MeasurementRecord {
  name: string;
  value: number | null;
  unit: MeasurementUnit;
  /** 0–1, from landmark visibility / detector score / tap precision. Null if not known. */
  confidence: number | null;
  /** ± uncertainty in `unit` (one standard error). Null if not known. */
  uncertainty: number | null;
  source: MeasurementSource;
  calibration: CalibrationStatus;
  validation: ValidationStatus;
  /** Human-readable reasons for a non-valid status. */
  issues: string[];
  timestamp: number;
}

export function makeRecord(
  r: Omit<MeasurementRecord, 'validation' | 'issues' | 'timestamp'> &
    Partial<Pick<MeasurementRecord, 'validation' | 'issues' | 'timestamp'>>
): MeasurementRecord {
  const value = r.value != null && Number.isFinite(r.value) ? r.value : null;
  return {
    ...r,
    value,
    validation: value == null ? 'rejected' : r.validation ?? 'valid',
    issues: r.issues ?? (value == null ? ['No value could be measured'] : []),
    timestamp: r.timestamp ?? Date.now(),
  };
}

/** Rank of a calibration status — higher is more trustworthy. */
export const CALIBRATION_RANK: Record<CalibrationStatus, number> = {
  'user-measured': 3,
  calibrated: 2,
  estimated: 1,
  unavailable: 0,
};

/** Plain-language label shown next to a value so estimates never look like verified measurements. */
export const CALIBRATION_LABEL: Record<CalibrationStatus, string> = {
  'user-measured': 'Measured (tape / known value)',
  calibrated: 'Calibrated estimate',
  estimated: 'Rough estimate — not calibrated',
  unavailable: 'Not available',
};
