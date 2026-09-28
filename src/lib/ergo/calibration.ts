/**
 * ErgoAI calibration — optional pixel↔real-world scale (spec §11).
 *
 * A single RGB camera cannot recover true physical dimensions on its own. If the
 * user places a known-size reference object in frame and tells us its real width,
 * we can derive a pixels-per-cm scale and report distances as a "calibrated
 * estimate" instead of a bare relative guess. Without it we stay in "estimated"
 * mode and never print a centimetre value we can't back up.
 */

import { ErgoCalibration, MeasurementMode } from './ergoTypes';

/** Common reference objects and their real-world width in centimetres. */
export const REFERENCE_PRESETS: { id: string; label: string; widthCm: number }[] = [
  { id: 'a4-landscape', label: 'A4 paper (landscape, 29.7 cm)', widthCm: 29.7 },
  { id: 'a4-portrait', label: 'A4 paper (portrait, 21.0 cm)', widthCm: 21.0 },
  { id: 'id-card', label: 'ID / credit card (8.56 cm)', widthCm: 8.56 },
  { id: 'letter', label: 'US Letter (landscape, 27.94 cm)', widthCm: 27.94 },
  { id: 'custom', label: 'Custom width…', widthCm: 0 },
];

/** An empty calibration — nothing measured yet. */
export const emptyCalibration: ErgoCalibration = {
  referenceId: null,
  realCm: null,
  refPixels: null,
  pixelsPerCm: null,
};

/** Derive pixels-per-cm from a reference object's pixel and real width. */
export function pixelsPerCm(refPixels: number, realCm: number): number | null {
  if (!refPixels || !realCm || refPixels <= 0 || realCm <= 0) return null;
  return refPixels / realCm;
}

/** Recompute the derived scale after any field changes. */
export function withDerivedScale(cal: ErgoCalibration): ErgoCalibration {
  const scale =
    cal.refPixels != null && cal.realCm != null
      ? pixelsPerCm(cal.refPixels, cal.realCm)
      : null;
  return { ...cal, pixelsPerCm: scale };
}

/** Convert a pixel distance to cm using the calibration, or null if uncalibrated. */
export function pxToCm(pixels: number, cal: ErgoCalibration | null): number | null {
  if (!cal?.pixelsPerCm) return null;
  return pixels / cal.pixelsPerCm;
}

/**
 * The measurement mode for a derived distance: `user-measured` beats everything,
 * otherwise `calibrated` when a scale exists, else `estimated`.
 */
export function distanceMode(
  userValue: number | null,
  cal: ErgoCalibration | null
): MeasurementMode {
  if (userValue != null) return 'user-measured';
  if (cal?.pixelsPerCm) return 'calibrated';
  return 'estimated';
}

/** Is the calibration usable (has a derived scale)? */
export function isCalibrated(cal: ErgoCalibration | null): boolean {
  return !!cal?.pixelsPerCm;
}
