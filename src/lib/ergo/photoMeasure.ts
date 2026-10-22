/**
 * ErgoAI photo measurement — turn taps on a photo into centimetres.
 *
 * One camera only sees pixels. To get real sizes we need a scale: a known length
 * lying in the SAME plane (same distance from the camera) as the thing being
 * measured. The user taps the two ends of that reference (A4 sheet, ID card, a
 * standing person of known height…), we get pixels-per-cm, and any other two taps
 * in that plane convert to cm.
 *
 * Every value carries an uncertainty (±cm) derived from how precisely a finger can
 * place a point on the displayed image — so the UI never shows false precision.
 * All coordinates here are in the photo's own pixel space (natural size).
 */

import type { ErgoBox } from './ergoTypes';
import type { ImgPoint } from './anthropometry';

export type { ImgPoint };

export function pxDist(a: ImgPoint, b: ImgPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Pixels-per-cm from a reference of known real length. */
export function scaleFromReference(a: ImgPoint, b: ImgPoint, realCm: number): number | null {
  const d = pxDist(a, b);
  if (!(realCm > 0) || d < 4) return null;
  return d / realCm;
}

export interface CmMeasurement {
  cm: number;
  /** ± uncertainty in cm (one standard tap error on each of the 4 points). */
  errCm: number;
}

/**
 * Convert a tapped segment to cm.
 *
 * @param tapErrPx  how far (in photo pixels) a tap may land from the intended
 *                  point — ≈ 4 screen px scaled to photo resolution.
 * @param refPx     pixel length of the reference segment (its own tap error
 *                  propagates as a relative error on the scale).
 */
export function measureCm(
  a: ImgPoint,
  b: ImgPoint,
  pxPerCm: number,
  refPx: number,
  tapErrPx: number
): CmMeasurement | null {
  if (!(pxPerCm > 0)) return null;
  const d = pxDist(a, b);
  const cm = d / pxPerCm;
  // Error of the measured segment (two endpoints) and relative error of the scale.
  const segErrCm = (Math.SQRT2 * tapErrPx) / pxPerCm;
  const scaleRel = refPx > 0 ? (Math.SQRT2 * tapErrPx) / refPx : 0;
  const errCm = Math.hypot(segErrCm, cm * scaleRel);
  return { cm: Math.round(cm * 10) / 10, errCm: Math.max(0.1, Math.round(errCm * 10) / 10) };
}

/** Height × width (cm) of a detected object's box in a calibrated photo. */
export function boxDimsCm(
  box: ErgoBox,
  frameW: number,
  frameH: number,
  pxPerCm: number
): { heightCm: number; widthCm: number } | null {
  if (!(pxPerCm > 0) || !frameW || !frameH) return null;
  return {
    heightCm: Math.round(((box.h * frameH) / pxPerCm) * 10) / 10,
    widthCm: Math.round(((box.w * frameW) / pxPerCm) * 10) / 10,
  };
}

/** Vertical measuring line along the left edge of a detected box (top → floor). */
export function boxHeightPoints(box: ErgoBox, frameW: number, frameH: number): [ImgPoint, ImgPoint] {
  const x = (box.x + box.w / 2) * frameW;
  return [
    { x, y: box.y * frameH },
    { x, y: (box.y + box.h) * frameH },
  ];
}

/** Horizontal measuring line across a detected box. */
export function boxWidthPoints(box: ErgoBox, frameW: number, frameH: number): [ImgPoint, ImgPoint] {
  const y = (box.y + box.h / 2) * frameH;
  return [
    { x: box.x * frameW, y },
    { x: (box.x + box.w) * frameW, y },
  ];
}

/**
 * How much the tapped line leans from pure vertical/horizontal (degrees). A
 * "height" drawn at a slant usually means the camera isn't level or the taps
 * missed — the UI warns above ~8°.
 */
export function lineTiltDeg(a: ImgPoint, b: ImgPoint, axis: 'vertical' | 'horizontal'): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const deg = (Math.atan2(axis === 'vertical' ? dx : dy, axis === 'vertical' ? dy : dx) * 180) / Math.PI;
  return Math.round(deg);
}
