/**
 * Turn one MediaPipe pose frame into the neutral-anatomy joint angles the
 * ergonomic standards (RULA / REBA) need.
 *
 * Reuses the low-level primitives from `@/lib/poseDetection` — this module adds
 * no new pose maths of its own beyond composing them into named joint angles.
 * All angles are in degrees, referenced so that ~0 = neutral upright posture.
 */

import { Landmark, calculateAngle2D } from '@/lib/poseDetection';
import { ErgoAngles } from './ergoTypes';

// MediaPipe Pose landmark indices (subset we use).
const L = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const vis = (l?: Landmark) => l?.visibility ?? 0;
const seen = (l?: Landmark) => vis(l) > 0.3;

function mid(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(vis(a), vis(b)),
  };
}

/**
 * Angle of the vector (from → to) away from the upward vertical, in degrees.
 * 0° = pointing straight up. In image space y grows downward, so "up" is -y.
 * Always positive (magnitude of the lean).
 */
function angleFromVertical(from: Landmark, to: Landmark): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  // Dot with the up vector (0, -1): cosθ = (-dy) / len.
  const cos = -dy / len;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Pick the side (left/right) whose landmarks are more confidently visible. */
function betterSide(lm: Landmark[]): 'left' | 'right' {
  const left = vis(lm[L.leftShoulder]) + vis(lm[L.leftHip]) + vis(lm[L.leftElbow]);
  const right = vis(lm[L.rightShoulder]) + vis(lm[L.rightHip]) + vis(lm[L.rightElbow]);
  return right > left ? 'right' : 'left';
}

/**
 * Extract joint angles for one frame. `view` tells us whether to read sagittal
 * (side) or coronal (front) quantities; a few angles are meaningful in both.
 */
export function extractErgoAngles(lm: Landmark[], view: 'side' | 'front'): ErgoAngles {
  const side = betterSide(lm);
  const S = side === 'left' ? L.leftShoulder : L.rightShoulder;
  const H = side === 'left' ? L.leftHip : L.rightHip;
  const E = side === 'left' ? L.leftElbow : L.rightElbow;
  const W = side === 'left' ? L.leftWrist : L.rightWrist;
  const Idx = side === 'left' ? L.leftIndex : L.rightIndex;
  const Ear = side === 'left' ? L.leftEar : L.rightEar;
  const K = side === 'left' ? L.leftKnee : L.rightKnee;
  const A = side === 'left' ? L.leftAnkle : L.rightAnkle;

  const shoulder = lm[S];
  const hip = lm[H];
  const elbow = lm[E];
  const wrist = lm[W];
  const index = lm[Idx];
  const ear = lm[Ear];
  const knee = lm[K];
  const ankle = lm[A];

  const shoulderMid =
    seen(lm[L.leftShoulder]) && seen(lm[L.rightShoulder])
      ? mid(lm[L.leftShoulder], lm[L.rightShoulder])
      : shoulder;
  const hipMid =
    seen(lm[L.leftHip]) && seen(lm[L.rightHip]) ? mid(lm[L.leftHip], lm[L.rightHip]) : hip;

  // ---- Trunk ----
  // Flexion: lean of the hip→shoulder line away from vertical.
  const trunkFlexion =
    seen(shoulder) && seen(hip) ? angleFromVertical(hipMid, shoulderMid) : null;
  // Side-bend uses the same magnitude but is only meaningful from the front.
  const trunkSideBend = view === 'front' && trunkFlexion !== null ? trunkFlexion : null;

  // ---- Neck ----
  // Head-on-trunk angle: 180 when ear sits directly above shoulder in line with
  // the trunk; less as the head drops forward → flexion = 180 − included.
  let neckFlexion: number | null = null;
  if (seen(ear) && seen(shoulder) && seen(hip)) {
    const included = calculateAngle2D(hip, shoulder, ear);
    neckFlexion = Math.max(0, 180 - included);
  }
  const neckSideBend = view === 'front' && seen(ear) && seen(shoulder)
    ? angleFromVertical(shoulderMid, ear)
    : null;

  // ---- Upper arm (shoulder flexion/elevation) ----
  // Angle at the shoulder between the trunk (shoulder→hip) and the upper arm
  // (shoulder→elbow).
  let upperArmElevation: number | null = null;
  if (seen(shoulder) && seen(hip) && seen(elbow)) {
    upperArmElevation = calculateAngle2D(hip, shoulder, elbow);
  }
  const shoulderAbduction = view === 'front' ? upperArmElevation : null;

  // Shrug heuristic: shoulder sitting high relative to the ear (small vertical
  // gap) suggests a raised shoulder. Conservative — false unless clearly raised.
  const shoulderRaised =
    seen(shoulder) && seen(ear) ? shoulder.y - ear.y < 0.06 : false;

  // ---- Lower arm (elbow flexion) ----
  let lowerArmAngle: number | null = null;
  if (seen(shoulder) && seen(elbow) && seen(wrist)) {
    const included = calculateAngle2D(shoulder, elbow, wrist);
    lowerArmAngle = Math.max(0, 180 - included); // flexion from straight
  }

  // ---- Wrist (rough) ----
  // Deviation of the hand (wrist→index) from the forearm line (elbow→wrist).
  let wristAngle: number | null = null;
  if (seen(elbow) && seen(wrist) && seen(index)) {
    const included = calculateAngle2D(elbow, wrist, index);
    wristAngle = Math.abs(180 - included);
  }

  // ---- Legs ----
  let kneeAngle: number | null = null;
  if (seen(hip) && seen(knee) && seen(ankle)) {
    const included = calculateAngle2D(hip, knee, ankle);
    kneeAngle = Math.max(0, 180 - included); // knee flexion
  }
  const legsSupported =
    seen(lm[L.leftAnkle]) && seen(lm[L.rightAnkle])
      ? Math.abs(lm[L.leftAnkle].y - lm[L.rightAnkle].y) < 0.08
      : seen(ankle);

  // ---- Confidence: mean visibility of the driving joints ----
  const key = [shoulder, hip, elbow, wrist, ear, knee, ankle];
  const confidence =
    key.reduce((s, l) => s + vis(l), 0) / key.length;

  return {
    view,
    neckFlexion,
    neckSideBend,
    neckTwist: null,
    trunkFlexion,
    trunkSideBend,
    trunkTwist: null,
    upperArmElevation,
    shoulderAbduction,
    shoulderRaised,
    lowerArmAngle,
    wristAngle,
    kneeAngle,
    legsSupported,
    confidence,
  };
}

// Landmark indices exported for the overlay so ErgoCapture can colour segments.
export const ERGO_LANDMARKS = L;
