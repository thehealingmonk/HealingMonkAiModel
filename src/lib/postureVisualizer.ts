import { Landmark } from '@/lib/poseDetection';
import type { Severity } from '@/lib/clinicalKnowledge';

export interface PosturePoint {
  landmarkIndex: number;
  name: string;
  status: 'correct' | 'incorrect' | 'unknown';
  x: number;
  y: number;
  confidence: number;
}

export interface PostureAnalysis {
  points: PosturePoint[];
  overallCorrect: boolean;
  correctPercentage: number;
  issues: string[];
  plumbLine?: PlumbLine;
}

// A single joint measured against the vertical plumb line dropped from the ankle.
export interface PlumbDeviation {
  name: string;
  landmarkIndex: number;
  /** Signed horizontal offset as a % of body height. Positive = toward the face (forward). */
  deviationPct: number;
  /** Angle of the joint off the vertical plumb line, in degrees (measured from the ankle pivot). */
  angleDeg: number;
  direction: 'forward' | 'backward' | 'aligned';
  status: 'correct' | 'incorrect';
  x: number;
  y: number;
}

// The vertical reference line used for side-view (sagittal) posture screening.
export interface PlumbLine {
  side: 'left' | 'right';
  /** Normalized x of the ankle — the vertical line sits here. */
  baseX: number;
  ankleY: number;
  topY: number;
  /** +1 if the subject faces +x, -1 if they face -x. */
  facingSign: number;
  deviations: PlumbDeviation[];
}

// Joints checked against the plumb line, with their tolerance (% of body height).
const PLUMB_CHECKPOINTS: { name: string; left: number; right: number; tolerancePct: number }[] = [
  { name: 'Ear', left: 7, right: 8, tolerancePct: 6 },
  { name: 'Shoulder', left: 11, right: 12, tolerancePct: 6 },
  { name: 'Hip', left: 23, right: 24, tolerancePct: 5 },
  { name: 'Knee', left: 25, right: 26, tolerancePct: 5 },
];

const ANKLE = { left: 27, right: 28 } as const;

const vis = (l?: Landmark) => (l?.visibility ?? 0);

/**
 * Detect whether the subject is standing in side-profile (sagittal) view —
 * the orientation the plumb-line screen needs. In a side view the two
 * shoulders line up in depth, so their horizontal spread collapses relative
 * to the torso height.
 */
export function isSideProfile(landmarks: Landmark[], aspectRatio = 16 / 9): boolean {
  if (landmarks.length < 33) return false;
  const ls = landmarks[11];
  const rs = landmarks[12];
  const lh = landmarks[23];
  const rh = landmarks[24];
  if (vis(ls) < 0.5 || vis(rs) < 0.5 || vis(lh) < 0.5 || vis(rh) < 0.5) return false;

  const shoulderWidth = Math.abs(ls.x - rs.x) * aspectRatio;
  const torsoHeight = Math.abs((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2) || 1;
  return shoulderWidth / torsoHeight < 0.5;
}

// A point on the body's central axis checked against the fixed center line.
export interface CenterPoint {
  name: string;
  x: number;
  y: number;
  /** Signed horizontal offset from the center line, % of body height (+ = right). */
  offsetPct: number;
  onLine: boolean;
}

// How the body sits against the fixed vertical center ("ideal") line.
export interface CenterAlignment {
  /** Normalized x of the ideal line (0.5 = frame center). */
  centerX: number;
  aligned: boolean;
  /** Average horizontal offset of the body axis from center, % of body height (+ = right). */
  offsetPct: number;
  direction: 'left' | 'right' | 'centered';
  message: string;
  points: CenterPoint[];
}

const CENTER_TOLERANCE_PCT = 7; // body axis must sit within ±7% of the line

/**
 * Compare the body's central axis (head → shoulders → hips → ankles) against a
 * fixed vertical "ideal" line at centerX. Declares whether the person is
 * aligned to the line or leaning to one side, and flags each off-line point.
 */
export function analyzeCenterAlignment(
  landmarks: Landmark[],
  centerX = 0.5,
  aspectRatio = 16 / 9
): CenterAlignment | null {
  if (landmarks.length < 33) return null;

  const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const nose = landmarks[0];
  const ls = landmarks[11];
  const rs = landmarks[12];
  const lh = landmarks[23];
  const rh = landmarks[24];
  const la = landmarks[27];
  const ra = landmarks[28];

  if (vis(ls) < 0.5 || vis(rs) < 0.5 || vis(la) < 0.5 || vis(ra) < 0.5) return null;

  const shoulderMid = mid(ls, rs);
  const ankleMid = mid(la, ra);
  const bodyScale = Math.abs(shoulderMid.y - ankleMid.y) || 1;

  const axis: { name: string; x: number; y: number }[] = [];
  if (vis(nose) >= 0.5) axis.push({ name: 'Head', x: nose.x, y: nose.y });
  axis.push({ name: 'Shoulders', x: shoulderMid.x, y: shoulderMid.y });
  if (vis(lh) >= 0.5 && vis(rh) >= 0.5) {
    const hipMid = mid(lh, rh);
    axis.push({ name: 'Hips', x: hipMid.x, y: hipMid.y });
  }
  axis.push({ name: 'Ankles', x: ankleMid.x, y: ankleMid.y });

  const points: CenterPoint[] = axis.map((p) => {
    const offsetPct = ((p.x - centerX) * aspectRatio) / bodyScale * 100;
    return { name: p.name, x: p.x, y: p.y, offsetPct: Math.round(offsetPct * 10) / 10, onLine: Math.abs(offsetPct) <= CENTER_TOLERANCE_PCT };
  });

  const avg = points.reduce((s, p) => s + p.offsetPct, 0) / points.length;
  const offsetPct = Math.round(avg * 10) / 10;
  const aligned = points.every((p) => p.onLine);
  const direction: CenterAlignment['direction'] =
    aligned ? 'centered' : avg > 0 ? 'right' : 'left';
  const message = aligned
    ? 'Aligned to the ideal line'
    : `Body off-center to the ${direction} (${Math.abs(offsetPct)}%)`;

  return { centerX, aligned, offsetPct, direction, message, points };
}

/**
 * Draw the fixed vertical green "ideal" line from bottom to top, plus the
 * body's central-axis markers (green when on the line, red when off).
 */
export function drawCenterLine(
  ctx: CanvasRenderingContext2D,
  videoWidth: number,
  videoHeight: number,
  alignment?: CenterAlignment | null,
  centerX = 0.5
) {
  const x = (alignment?.centerX ?? centerX) * videoWidth;
  const aligned = alignment?.aligned ?? false;

  ctx.save();

  // The ideal line — bright green, full height, with a soft glow.
  ctx.shadowColor = aligned ? 'rgba(0,255,120,0.9)' : 'rgba(0,255,120,0.5)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = aligned ? '#00ff66' : '#00e676';
  ctx.lineWidth = aligned ? 4 : 3;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, videoHeight);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Body central-axis markers and connectors to the line.
  if (alignment) {
    for (const p of alignment.points) {
      const px = p.x * videoWidth;
      const py = p.y * videoHeight;
      const color = p.onLine ? '#00ff66' : '#ff3b3b';

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(px, py);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Build a plumb line from one leg: a straight vertical line through the ankle.
 * Each key joint's horizontal deviation from that line is measured as a % of
 * body height, so a side-view (sagittal) posture can be screened and reported.
 */
export function computePlumbLine(
  landmarks: Landmark[],
  aspectRatio = 16 / 9
): PlumbLine | null {
  if (landmarks.length < 33) return null;

  // Pick the side facing the camera (the more visible leg/torso).
  const score = (side: 'left' | 'right') =>
    vis(landmarks[ANKLE[side]]) +
    PLUMB_CHECKPOINTS.reduce((s, c) => s + vis(landmarks[side === 'left' ? c.left : c.right]), 0);

  const side: 'left' | 'right' = score('left') >= score('right') ? 'left' : 'right';
  const ankle = landmarks[ANKLE[side]];
  const shoulder = landmarks[side === 'left' ? 11 : 12];

  if (vis(ankle) < 0.5 || vis(shoulder) < 0.5) return null;

  // Body height proxy = vertical span ankle→shoulder. Gives a scale-free %.
  const bodyScale = Math.abs(shoulder.y - ankle.y) || 1;

  // Facing direction from nose relative to the ankle (fallback: shoulder).
  const nose = landmarks[0];
  const facingRef = vis(nose) >= 0.5 ? nose.x : shoulder.x;
  const facingSign = facingRef - ankle.x >= 0 ? 1 : -1;

  const deviations: PlumbDeviation[] = [];
  let topY = ankle.y;

  for (const c of PLUMB_CHECKPOINTS) {
    const idx = side === 'left' ? c.left : c.right;
    const joint = landmarks[idx];
    if (vis(joint) < 0.5) continue;

    const offset = (joint.x - ankle.x) / bodyScale; // signed fraction of body height
    const forwardPct = offset * facingSign * 100; // + = forward (toward face)

    // Angle off the vertical plumb line, measured from the ankle pivot.
    // x is width-normalized and y height-normalized, so correct x by aspect.
    const angleDeg =
      Math.round(
        Math.abs(
          Math.atan2((joint.x - ankle.x) * aspectRatio, ankle.y - joint.y)
        ) *
          (180 / Math.PI) *
          10
      ) / 10;

    const status: 'correct' | 'incorrect' =
      Math.abs(forwardPct) <= c.tolerancePct ? 'correct' : 'incorrect';
    const direction: PlumbDeviation['direction'] =
      status === 'correct' ? 'aligned' : forwardPct > 0 ? 'forward' : 'backward';

    deviations.push({
      name: c.name,
      landmarkIndex: idx,
      deviationPct: Math.round(forwardPct * 10) / 10,
      angleDeg,
      direction,
      status,
      x: joint.x,
      y: joint.y,
    });

    topY = Math.min(topY, joint.y);
  }

  if (deviations.length === 0) return null;

  return { side, baseX: ankle.x, ankleY: ankle.y, topY, facingSign, deviations };
}

// ---- Ear → Shoulder → Hip → Knee → Ankle posture chain vs the ankle plumb ----

export interface PostureChainJoint {
  name: string;
  index: number;
  /** Normalized coordinates (0..1). */
  x: number;
  y: number;
  /** Angle off the vertical ideal line, degrees (0 = perfectly aligned). */
  angle: number;
  aligned: boolean;
  /** The ankle pivot the ideal line is dropped from (excluded from the score). */
  isBase: boolean;
}

export interface PostureChain {
  /** Normalized x of the vertical "ideal" line (ankle midpoint, falling back to hip/shoulder). */
  lineX: number;
  /** Normalized y of the pivot the angles are measured from (ankle midpoint). */
  baseY: number;
  /** Chain joints in head→foot order. */
  joints: PostureChainJoint[];
  /** Mean absolute angle of ear/shoulder/hip/knee off the line, degrees. */
  score: number;
  rating: Severity;
}

// Chain checkpoints, head→foot. The ankle is the base the plumb is dropped from.
const CHAIN_POINTS: { name: string; left: number; right: number; tol: number; base?: boolean }[] = [
  { name: 'Ear', left: 7, right: 8, tol: 6 },
  { name: 'Shoulder', left: 11, right: 12, tol: 6 },
  { name: 'Hip', left: 23, right: 24, tol: 5 },
  { name: 'Knee', left: 25, right: 26, tol: 5 },
  { name: 'Ankle', left: 27, right: 28, tol: 5, base: true },
];

/**
 * Build the ear→shoulder→hip→knee→ankle posture chain and measure each joint's
 * angular deviation from a vertical "ideal" line dropped through the ankle
 * midpoint. Returns each joint (with its angle off the line) plus an aggregate
 * deviation-from-ideal score and severity rating. Works for side and front
 * views; `aspectRatio` should be the video's width / height so the angle is not
 * distorted by the normalized-coordinate space.
 */
export function computePostureChain(landmarks: Landmark[], aspectRatio = 16 / 9): PostureChain | null {
  if (landmarks.length < 33) return null;

  // Treat undefined visibility as visible so dots always anchor the line.
  const v = (l?: Landmark) => (l?.visibility ?? 1);
  const midX = (a: number, b: number): number | null =>
    v(landmarks[a]) > 0.3 && v(landmarks[b]) > 0.3 ? (landmarks[a].x + landmarks[b].x) / 2 : null;
  const midY = (a: number, b: number): number | null =>
    v(landmarks[a]) > 0.3 && v(landmarks[b]) > 0.3 ? (landmarks[a].y + landmarks[b].y) / 2 : null;

  const lineX = midX(27, 28) ?? midX(23, 24) ?? midX(11, 12);
  if (lineX === null) return null;
  const baseY = midY(27, 28) ?? midY(23, 24) ?? 1;

  const better = (l: number, r: number) => (v(landmarks[r]) > v(landmarks[l]) ? r : l);

  const joints: PostureChainJoint[] = [];
  let sum = 0;
  let n = 0;
  for (const c of CHAIN_POINTS) {
    const idx = better(c.left, c.right);
    const p = landmarks[idx];
    if (!p || v(p) <= 0.3) continue;
    const dx = Math.abs(p.x - lineX) * aspectRatio;
    const dy = Math.abs(baseY - p.y) || 1e-6;
    const angle = Math.round((Math.atan2(dx, dy) * (180 / Math.PI)) * 10) / 10;
    const isBase = !!c.base;
    joints.push({ name: c.name, index: idx, x: p.x, y: p.y, angle, aligned: angle <= c.tol, isBase });
    if (!isBase) {
      sum += angle;
      n++;
    }
  }
  if (joints.length === 0) return null;

  const score = n > 0 ? Math.round((sum / n) * 10) / 10 : 0;
  const rating: Severity = score <= 3 ? 'normal' : score <= 6 ? 'mild' : score <= 10 ? 'moderate' : 'severe';
  return { lineX, baseY, joints, score, rating };
}

// Define correct posture thresholds for key landmarks
const POSTURE_THRESHOLDS = {
  // Head position (should be over shoulders)
  head: {
    landmarkIndex: 0, // nose
    idealRelativeTo: [11, 12], // shoulders
    maxHorizontalDeviation: 0.1, // 10% of shoulder width
  },
  // Shoulders (should be level)
  leftShoulder: {
    landmarkIndex: 11,
    level: true,
  },
  rightShoulder: {
    landmarkIndex: 12,
    level: true,
  },
  // Hips (should be level)
  leftHip: {
    landmarkIndex: 23,
    level: true,
  },
  rightHip: {
    landmarkIndex: 24,
    level: true,
  },
};

export function analyzePostureVisually(
  landmarks: Landmark[],
  aspectRatio = 16 / 9
): PostureAnalysis {
  const points: PosturePoint[] = [];
  const issues: string[] = [];

  // Check head position
  const headStatus = checkHeadPosition(landmarks);
  points.push({
    landmarkIndex: 0,
    name: 'Head',
    status: headStatus,
    x: landmarks[0].x,
    y: landmarks[0].y,
    confidence: landmarks[0].visibility || 0,
  });
  if (headStatus === 'incorrect') {
    issues.push('Head forward posture detected');
  }

  // Check shoulder level
  const shoulderStatus = checkShoulderLevel(landmarks);
  points.push({
    landmarkIndex: 11,
    name: 'Left Shoulder',
    status: shoulderStatus,
    x: landmarks[11].x,
    y: landmarks[11].y,
    confidence: landmarks[11].visibility || 0,
  });
  points.push({
    landmarkIndex: 12,
    name: 'Right Shoulder',
    status: shoulderStatus,
    x: landmarks[12].x,
    y: landmarks[12].y,
    confidence: landmarks[12].visibility || 0,
  });
  if (shoulderStatus === 'incorrect') {
    issues.push('Shoulders not level');
  }

  // Check hip level
  const hipStatus = checkHipLevel(landmarks);
  points.push({
    landmarkIndex: 23,
    name: 'Left Hip',
    status: hipStatus,
    x: landmarks[23].x,
    y: landmarks[23].y,
    confidence: landmarks[23].visibility || 0,
  });
  points.push({
    landmarkIndex: 24,
    name: 'Right Hip',
    status: hipStatus,
    x: landmarks[24].x,
    y: landmarks[24].y,
    confidence: landmarks[24].visibility || 0,
  });
  if (hipStatus === 'incorrect') {
    issues.push('Hips not level');
  }

  // Check spine alignment
  const spineStatus = checkSpineAlignment(landmarks);
  if (spineStatus === 'incorrect') {
    issues.push('Spine not aligned');
  }

  // Check knee alignment
  const leftKneeStatus = checkKneeAlignment(landmarks, 'left');
  const rightKneeStatus = checkKneeAlignment(landmarks, 'right');

  points.push({
    landmarkIndex: 25,
    name: 'Left Knee',
    status: leftKneeStatus,
    x: landmarks[25].x,
    y: landmarks[25].y,
    confidence: landmarks[25].visibility || 0,
  });
  points.push({
    landmarkIndex: 26,
    name: 'Right Knee',
    status: rightKneeStatus,
    x: landmarks[26].x,
    y: landmarks[26].y,
    confidence: landmarks[26].visibility || 0,
  });

  if (leftKneeStatus === 'incorrect' || rightKneeStatus === 'incorrect') {
    issues.push('Knee alignment incorrect');
  }

  // Check ankle alignment
  const leftAnkleStatus = checkAnkleAlignment(landmarks, 'left');
  const rightAnkleStatus = checkAnkleAlignment(landmarks, 'right');

  points.push({
    landmarkIndex: 27,
    name: 'Left Ankle',
    status: leftAnkleStatus,
    x: landmarks[27].x,
    y: landmarks[27].y,
    confidence: landmarks[27].visibility || 0,
  });
  points.push({
    landmarkIndex: 28,
    name: 'Right Ankle',
    status: rightAnkleStatus,
    x: landmarks[28].x,
    y: landmarks[28].y,
    confidence: landmarks[28].visibility || 0,
  });

  // Plumb-line (side-view) screen: vertical line from the ankle, with each
  // joint's deviation measured against it and mentioned in the issues.
  const plumbLine = computePlumbLine(landmarks, aspectRatio);
  if (plumbLine) {
    for (const d of plumbLine.deviations) {
      if (d.status === 'incorrect') {
        issues.push(
          `${d.name} ${d.angleDeg}° ${d.direction} of plumb line (${Math.abs(d.deviationPct)}% of body height)`
        );
      }
    }
  }

  // Calculate overall correctness
  const correctCount = points.filter((p) => p.status === 'correct').length;
  const totalCount = points.filter((p) => p.confidence > 0.5).length;
  const correctPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  return {
    points,
    overallCorrect: issues.length === 0,
    correctPercentage,
    issues,
    plumbLine: plumbLine ?? undefined,
  };
}

function checkHeadPosition(landmarks: Landmark[]): 'correct' | 'incorrect' | 'unknown' {
  if ((landmarks[0]?.visibility ?? 0) < 0.5) return 'unknown';

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if ((leftShoulder.visibility ?? 0) < 0.5 || (rightShoulder.visibility ?? 0) < 0.5) return 'unknown';

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const deviation = Math.abs(nose.x - shoulderMidX);

  // Allow 10% deviation
  return deviation < 0.1 ? 'correct' : 'incorrect';
}

function checkShoulderLevel(landmarks: Landmark[]): 'correct' | 'incorrect' | 'unknown' {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];

  if ((leftShoulder.visibility ?? 0) < 0.5 || (rightShoulder.visibility ?? 0) < 0.5) return 'unknown';

  const yDiff = Math.abs(leftShoulder.y - rightShoulder.y);

  // Allow 5% vertical difference
  return yDiff < 0.05 ? 'correct' : 'incorrect';
}

function checkHipLevel(landmarks: Landmark[]): 'correct' | 'incorrect' | 'unknown' {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if ((leftHip.visibility ?? 0) < 0.5 || (rightHip.visibility ?? 0) < 0.5) return 'unknown';

  const yDiff = Math.abs(leftHip.y - rightHip.y);

  // Allow 5% vertical difference
  return yDiff < 0.05 ? 'correct' : 'incorrect';
}

function checkSpineAlignment(landmarks: Landmark[]): 'correct' | 'incorrect' | 'unknown' {
  const nose = landmarks[0];
  const shoulder = landmarks[11];
  const hip = landmarks[23];

  if ((nose.visibility ?? 0) < 0.5 || (shoulder.visibility ?? 0) < 0.5 || (hip.visibility ?? 0) < 0.5) {
    return 'unknown';
  }

  // Calculate spine straightness by checking x-deviation
  const shoulderToHipX = hip.x - shoulder.x;
  const noseToShoulderX = shoulder.x - nose.x;

  // They should be roughly aligned (similar x deviation)
  const deviation = Math.abs(shoulderToHipX - noseToShoulderX);

  return deviation < 0.15 ? 'correct' : 'incorrect';
}

function checkKneeAlignment(landmarks: Landmark[], side: 'left' | 'right'): 'correct' | 'incorrect' | 'unknown' {
  const kneeIdx = side === 'left' ? 25 : 26;
  const ankleIdx = side === 'left' ? 27 : 28;
  const hipIdx = side === 'left' ? 23 : 24;

  const knee = landmarks[kneeIdx];
  const ankle = landmarks[ankleIdx];
  const hip = landmarks[hipIdx];

  if ((knee.visibility ?? 0) < 0.5 || (ankle.visibility ?? 0) < 0.5 || (hip.visibility ?? 0) < 0.5) {
    return 'unknown';
  }

  // Knee should be roughly vertically aligned with ankle
  const xDiff = Math.abs(knee.x - ankle.x);

  return xDiff < 0.05 ? 'correct' : 'incorrect';
}

function checkAnkleAlignment(landmarks: Landmark[], side: 'left' | 'right'): 'correct' | 'incorrect' | 'unknown' {
  const ankleIdx = side === 'left' ? 27 : 28;
  const heelIdx = side === 'left' ? 29 : 30;

  const ankle = landmarks[ankleIdx];
  const heel = landmarks[heelIdx];

  if ((ankle.visibility ?? 0) < 0.5 || (heel.visibility ?? 0) < 0.5) {
    return 'unknown';
  }

  // Ankles should be relatively straight
  const xDiff = Math.abs(ankle.x - heel.x);

  return xDiff < 0.08 ? 'correct' : 'incorrect';
}

// Draw visualization with green/red indicators
export function drawPostureVisualization(
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  analysis: PostureAnalysis,
  videoWidth: number,
  videoHeight: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw skeleton connections with color coding
  const connections = [
    [11, 12], // shoulders
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ];

  // Draw connections
  ctx.lineWidth = 3;
  for (const [start, end] of connections) {
    const startLandmark = landmarks[start];
    const endLandmark = landmarks[end];

    if ((startLandmark?.visibility ?? 0) > 0.5 && (endLandmark?.visibility ?? 0) > 0.5) {
      const startPoint = analysis.points.find((p) => p.landmarkIndex === start);
      const endPoint = analysis.points.find((p) => p.landmarkIndex === end);

      // Use color based on status
      const startStatus = startPoint?.status || 'unknown';
      const endStatus = endPoint?.status || 'unknown';

      if (startStatus === 'correct' && endStatus === 'correct') {
        ctx.strokeStyle = '#00ff00'; // Green for correct
      } else if (startStatus === 'incorrect' || endStatus === 'incorrect') {
        ctx.strokeStyle = '#ff0000'; // Red for incorrect
      } else {
        ctx.strokeStyle = '#ffff00'; // Yellow for unknown
      }

      ctx.beginPath();
      ctx.moveTo(startLandmark.x * videoWidth, startLandmark.y * videoHeight);
      ctx.lineTo(endLandmark.x * videoWidth, endLandmark.y * videoHeight);
      ctx.stroke();
    }
  }

  // Draw landmarks with color coding
  for (const point of analysis.points) {
    const landmark = landmarks[point.landmarkIndex];
    if (!landmark || (landmark.visibility ?? 0) < 0.5) continue;

    const x = landmark.x * videoWidth;
    const y = landmark.y * videoHeight;
    const radius = 8;

    // Set color based on status
    if (point.status === 'correct') {
      ctx.fillStyle = '#00ff00'; // Green
      ctx.strokeStyle = '#00aa00';
    } else if (point.status === 'incorrect') {
      ctx.fillStyle = '#ff0000'; // Red
      ctx.strokeStyle = '#aa0000';
    } else {
      ctx.fillStyle = '#ffff00'; // Yellow
      ctx.strokeStyle = '#aaaa00';
    }

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  // Draw the plumb line from the ankle and label each joint's deviation.
  if (analysis.plumbLine) {
    drawPlumbLine(ctx, analysis.plumbLine, videoWidth, videoHeight);
  }

  // Draw status text at the bottom
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Arial';
  ctx.textAlign = 'left';
  const statusText = `Posture Correctness: ${analysis.correctPercentage}%`;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(statusText, 20, videoHeight - 20);
  ctx.fillText(statusText, 20, videoHeight - 20);
}

// Render the vertical plumb line from the ankle plus a labelled connector to
// each measured joint (green when aligned, red when it deviates).
export function drawPlumbLine(
  ctx: CanvasRenderingContext2D,
  plumb: PlumbLine,
  videoWidth: number,
  videoHeight: number
) {
  const lineX = plumb.baseX * videoWidth;
  const topY = plumb.topY * videoHeight - 30; // extend a little above the head
  const bottomY = plumb.ankleY * videoHeight;

  // Vertical reference line (dashed white).
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lineX, topY);
  ctx.lineTo(lineX, bottomY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Base marker at the ankle.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(lineX, bottomY, 5, 0, 2 * Math.PI);
  ctx.fill();

  ctx.font = 'bold 13px Arial';
  ctx.textAlign = 'left';

  for (const d of plumb.deviations) {
    const jointX = d.x * videoWidth;
    const jointY = d.y * videoHeight;
    const color = d.status === 'correct' ? '#00ff00' : '#ff3b3b';

    // Horizontal connector from the plumb line to the joint.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineX, jointY);
    ctx.lineTo(jointX, jointY);
    ctx.stroke();

    // Label: e.g. "Shoulder 9% fwd".
    const tag =
      d.status === 'correct'
        ? `${d.name} aligned`
        : `${d.name} ${d.angleDeg}° ${d.direction === 'forward' ? 'fwd' : 'back'}`;
    const labelX = jointX + (plumb.facingSign >= 0 ? 12 : -12 - ctx.measureText(tag).width);

    ctx.fillStyle = '#000000';
    ctx.fillRect(labelX - 4, jointY - 16, ctx.measureText(tag).width + 8, 18);
    ctx.fillStyle = color;
    ctx.fillText(tag, labelX, jointY - 3);
  }

  ctx.restore();
}
