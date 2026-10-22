/**
 * ErgoAI anthropometry — body dimensions for "this person" and "the average human".
 *
 * Furniture fit depends on body segment sizes (popliteal height, sitting elbow
 * height, hip breadth…), not on stature alone. We don't ask the user for a dozen
 * tape measurements: we take ONE reliable number — stature (entered, scanned, or a
 * population average) — and derive the rest from published stature ratios
 * (Pheasant, "Bodyspace", 50th-percentile adults; consistent with the classic
 * Drillis & Contini segment proportions). Population-level ratios are accurate to
 * roughly ±3–5 % for an individual, which is why a directly measured value always
 * overrides a derived one.
 */

import type { Landmark } from '@/lib/poseDetection';

export type PopulationId = 'in-adult' | 'in-male' | 'in-female' | 'global-male' | 'global-female';
export type BodySex = 'male' | 'female' | 'mixed';

/** 50th-percentile adult stature for each reference population (cm). */
export const POPULATIONS: { id: PopulationId; label: string; statureCm: number; sex: BodySex }[] = [
  { id: 'in-adult', label: 'Average Indian adult (~159 cm)', statureCm: 159, sex: 'mixed' },
  { id: 'in-male', label: 'Average Indian man (~165 cm)', statureCm: 165, sex: 'male' },
  { id: 'in-female', label: 'Average Indian woman (~152 cm)', statureCm: 152, sex: 'female' },
  { id: 'global-male', label: 'Average adult man, global (~175 cm)', statureCm: 175, sex: 'male' },
  { id: 'global-female', label: 'Average adult woman, global (~162 cm)', statureCm: 162, sex: 'female' },
];

export function population(id: PopulationId) {
  return POPULATIONS.find((p) => p.id === id) ?? POPULATIONS[0];
}

/** Dimension / stature ratios (Pheasant 50th-percentile, unshod). */
const RATIO = {
  eyeHeight: 0.936, // standing, floor → eye
  shoulderHeight: 0.819,
  elbowHeight: 0.626, // standing
  sittingHeight: 0.523, // seat → top of head
  sittingEyeHeight: 0.454, // seat → eye
  sittingShoulderHeight: 0.342, // seat → shoulder
  sittingElbowHeight: 0.141, // seat → underside of elbow
  thighThickness: 0.092,
  buttockPoplitealLength: 0.284, // seat depth driver
  kneeHeight: 0.313,
  poplitealHeight: 0.253, // floor → underside of thigh behind knee (seat height driver)
  shoulderBreadth: 0.23, // biacromial
  upperArmLength: 0.186, // shoulder → elbow
  forearmLength: 0.146, // elbow → wrist
};

/** Sitting hip breadth differs by sex much more than the other ratios. */
const HIP_RATIO: Record<BodySex, number> = { male: 0.207, female: 0.23, mixed: 0.218 };

export interface BodyDims {
  statureCm: number;
  eyeHeightCm: number;
  shoulderHeightCm: number;
  elbowHeightCm: number;
  sittingHeightCm: number;
  sittingEyeHeightCm: number;
  sittingShoulderHeightCm: number;
  sittingElbowHeightCm: number;
  thighThicknessCm: number;
  buttockPoplitealLengthCm: number;
  kneeHeightCm: number;
  poplitealHeightCm: number;
  shoulderBreadthCm: number;
  hipBreadthCm: number;
  upperArmLengthCm: number;
  forearmLengthCm: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Derive every body dimension we need from stature. */
export function bodyFromStature(statureCm: number, sex: BodySex = 'mixed'): BodyDims {
  const h = statureCm;
  return {
    statureCm: r1(h),
    eyeHeightCm: r1(h * RATIO.eyeHeight),
    shoulderHeightCm: r1(h * RATIO.shoulderHeight),
    elbowHeightCm: r1(h * RATIO.elbowHeight),
    sittingHeightCm: r1(h * RATIO.sittingHeight),
    sittingEyeHeightCm: r1(h * RATIO.sittingEyeHeight),
    sittingShoulderHeightCm: r1(h * RATIO.sittingShoulderHeight),
    sittingElbowHeightCm: r1(h * RATIO.sittingElbowHeight),
    thighThicknessCm: r1(h * RATIO.thighThickness),
    buttockPoplitealLengthCm: r1(h * RATIO.buttockPoplitealLength),
    kneeHeightCm: r1(h * RATIO.kneeHeight),
    poplitealHeightCm: r1(h * RATIO.poplitealHeight),
    shoulderBreadthCm: r1(h * RATIO.shoulderBreadth),
    hipBreadthCm: r1(h * HIP_RATIO[sex]),
    upperArmLengthCm: r1(h * RATIO.upperArmLength),
    forearmLengthCm: r1(h * RATIO.forearmLength),
  };
}

/** Plausible adult stature window — anything outside is a tap/scale mistake. */
export const STATURE_MIN_CM = 120;
export const STATURE_MAX_CM = 215;

export function isPlausibleStature(cm: number | null | undefined): cm is number {
  return cm != null && Number.isFinite(cm) && cm >= STATURE_MIN_CM && cm <= STATURE_MAX_CM;
}

// ---------------------------------------------------------------------------
//  Person points from pose landmarks (used to auto-place measuring handles).
// ---------------------------------------------------------------------------

export interface ImgPoint {
  x: number;
  y: number;
}

const seen = (l?: Landmark) => !!l && (l.visibility ?? 1) > 0.4;

function mid(a?: Landmark, b?: Landmark): Landmark | null {
  if (seen(a) && seen(b)) return { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2, z: 0 };
  if (seen(a)) return a!;
  if (seen(b)) return b!;
  return null;
}

/**
 * Head-top and floor points (image pixels) for a STANDING person, from MediaPipe
 * landmarks. The head top isn't a landmark, so it is extrapolated from the eye →
 * floor span using the eye-height / stature ratio (eye sits at 93.6 % of stature).
 * Returns null when the full body isn't visible or the person isn't upright —
 * the user then places the points by hand.
 */
export function standingPersonPoints(
  lm: Landmark[] | null | undefined,
  frameW: number,
  frameH: number
): { top: ImgPoint; floor: ImgPoint; standing: boolean } | null {
  if (!lm || !frameW || !frameH) return null;
  const eye = mid(lm[2], lm[5]) ?? (seen(lm[0]) ? lm[0] : null);
  const heel = mid(lm[29], lm[30]);
  const toe = mid(lm[31], lm[32]);
  const hip = mid(lm[23], lm[24]);
  const knee = mid(lm[25], lm[26]);
  const ankle = mid(lm[27], lm[28]);
  if (!eye || !(heel || toe) || !hip || !knee || !ankle) return null;

  const floorY = Math.max(heel?.y ?? 0, toe?.y ?? 0) * frameH;
  const floorX = (heel ?? toe)!.x * frameW;
  const eyeY = eye.y * frameH;
  if (floorY <= eyeY) return null;
  const stature = (floorY - eyeY) / RATIO.eyeHeight;
  const topY = floorY - stature;

  // Upright check: hip–knee–ankle nearly straight and hip above knee above ankle.
  const v1 = { x: (hip.x - knee.x) * frameW, y: (hip.y - knee.y) * frameH };
  const v2 = { x: (ankle.x - knee.x) * frameW, y: (ankle.y - knee.y) * frameH };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  const kneeIncluded = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  const standing = kneeIncluded > 155 && hip.y < knee.y && knee.y < ankle.y;

  return { top: { x: floorX, y: Math.max(0, topY) }, floor: { x: floorX, y: floorY }, standing };
}

/** Left/right shoulder points (image pixels) — front view only is meaningful. */
export function shoulderPoints(
  lm: Landmark[] | null | undefined,
  frameW: number,
  frameH: number
): { a: ImgPoint; b: ImgPoint } | null {
  if (!lm || !seen(lm[11]) || !seen(lm[12])) return null;
  return {
    a: { x: lm[11].x * frameW, y: lm[11].y * frameH },
    b: { x: lm[12].x * frameW, y: lm[12].y * frameH },
  };
}

/**
 * MediaPipe's shoulder landmarks sit on the shoulder JOINT centres, a little
 * inside the bony acromion points used for biacromial breadth. Joint-to-joint
 * span ≈ 0.88 × biacromial breadth in adults, so we scale up to report the
 * standard anthropometric measure.
 */
export const SHOULDER_JOINT_TO_BIACROMIAL = 1 / 0.88;
