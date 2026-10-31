/**
 * ErgoAI live measurement — height × width (cm) shown on the camera while scanning.
 *
 * One camera only sees pixels, so every live size needs a scale (pixels per cm).
 * We get it one of two ways, best first:
 *   1. "height"   — the user typed their real height and is standing fully in
 *                   frame: their head-to-floor span in pixels ÷ their height.
 *                   Accurate for things at about the same distance as the person.
 *   2. "distance" — the user's rough camera-to-object distance plus a typical
 *                   camera field of view. Always available, but only approximate.
 * The source always travels with the numbers so the UI can say how sure it is.
 */

import type { Landmark } from '@/lib/poseDetection';
import type { DetectedObject, ErgoBox } from './ergoTypes';
import { standingPersonPoints, isPlausibleStature } from './anthropometry';

/** Typical horizontal field of view of laptop webcams / phone main cameras. */
export const ASSUMED_HFOV_DEG = 62;

export const DISTANCE_MIN_CM = 30;
export const DISTANCE_MAX_CM = 400;
export const DEFAULT_DISTANCE_CM = 150;

/**
 * - height        : user's real height, standing fully in frame (best)
 * - auto-person   : AI distance from average human body proportions
 * - auto-objects  : AI distance from standard-size objects (phone, keyboard…)
 * - distance      : the manual slider (fallback / auto switched off)
 */
export type LiveScaleSource = 'height' | 'auto-person' | 'auto-objects' | 'distance';

export interface LiveScale {
  pxPerCm: number;
  source: LiveScaleSource;
  /** Camera → subject distance (cm) this scale implies. */
  distanceCm: number;
}

export interface LiveMeasureSettings {
  /** Manual camera → subject distance (cm), used when auto can't tell. */
  distanceCm: number;
  /** The person's real height (cm), if they entered it. */
  statureCm: number | null;
  /** Let the AI estimate the distance itself. */
  autoDistance: boolean;
}

/** Camera focal length in pixels, from the assumed field of view. */
export function focalPx(frameW: number): number {
  return frameW / (2 * Math.tan(((ASSUMED_HFOV_DEG / 2) * Math.PI) / 180));
}

/** Scale from distance: pinhole camera, pxPerCm = focal / distance. */
export function pxPerCmFromDistance(frameW: number, distanceCm: number): number | null {
  if (!frameW || !(distanceCm > 0)) return null;
  return focalPx(frameW) / distanceCm;
}

/** Average adult stature used when the user hasn't entered theirs. */
const DEFAULT_STATURE_CM = 162;

/**
 * Body segments with their real length as a fraction of stature. MediaPipe
 * landmark indices. Eye span (IPD) is a fixed ~6.3 cm, not stature-based.
 */
const BODY_SEGMENTS: { a: number[]; b: number[]; ratio?: number; cm?: number }[] = [
  { a: [2], b: [5], cm: 6.3 }, // eye centre ↔ eye centre
  { a: [11], b: [12], ratio: 0.23 * 0.88 }, // shoulder joint span
  { a: [11, 12], b: [23, 24], ratio: 0.29 }, // mid-shoulder ↔ mid-hip (torso)
  { a: [11], b: [13], ratio: 0.186 }, // upper arms
  { a: [12], b: [14], ratio: 0.186 },
  { a: [13], b: [15], ratio: 0.146 }, // forearms
  { a: [14], b: [16], ratio: 0.146 },
  { a: [23], b: [25], ratio: 0.245 }, // thighs
  { a: [24], b: [26], ratio: 0.245 },
  { a: [25], b: [27], ratio: 0.27 }, // shins
  { a: [26], b: [28], ratio: 0.27 },
];

function avgPoint(lm: Landmark[], idx: number[], frameW: number, frameH: number) {
  const pts = idx.map((i) => lm[i]);
  if (pts.some((p) => !p || (p.visibility ?? 1) < 0.6)) return null;
  return {
    x: (pts.reduce((s, p) => s + p.x, 0) / pts.length) * frameW,
    y: (pts.reduce((s, p) => s + p.y, 0) / pts.length) * frameH,
  };
}

/**
 * Distance to the person from average body proportions. A segment pointing
 * towards the camera looks SHORTER, which can only make it look farther away,
 * so the nearest estimate across segments is the least foreshortened one. We
 * take the 2nd-nearest to shrug off one bad landmark.
 */
export function distanceFromPerson(
  lm: Landmark[] | null,
  frameW: number,
  frameH: number,
  statureCm: number | null
): number | null {
  if (!lm?.length || !frameW || !frameH) return null;
  const stature = isPlausibleStature(statureCm) ? statureCm : DEFAULT_STATURE_CM;
  const f = focalPx(frameW);
  const est: number[] = [];
  for (const s of BODY_SEGMENTS) {
    const a = avgPoint(lm, s.a, frameW, frameH);
    const b = avgPoint(lm, s.b, frameW, frameH);
    if (!a || !b) continue;
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (px < 8) continue;
    const realCm = s.cm ?? stature * (s.ratio ?? 0);
    est.push((f * realCm) / px);
  }
  if (!est.length) return null;
  est.sort((x, y) => x - y);
  return est[Math.min(1, est.length - 1)];
}

/** Typical size (cm) of the LONGER side of standard everyday objects. */
const TYPICAL_LONG_SIDE_CM: Record<string, number> = {
  'cell phone': 15,
  keyboard: 44,
  mouse: 11,
  laptop: 33,
  cup: 10,
  book: 23,
  remote: 18,
};

/** Distance from standard-size objects in frame (median over all of them). */
export function distanceFromObjects(objects: DetectedObject[], frameW: number, frameH: number): number | null {
  const f = focalPx(frameW);
  const est: number[] = [];
  for (const o of objects) {
    const real = TYPICAL_LONG_SIDE_CM[o.rawLabel];
    if (!real || o.score < 0.45) continue;
    const px = Math.max(o.box.w * frameW, o.box.h * frameH);
    if (px < 12) continue;
    est.push((f * real) / px);
  }
  if (!est.length) return null;
  est.sort((x, y) => x - y);
  return est[Math.floor(est.length / 2)];
}

const clampDist = (d: number) => Math.min(DISTANCE_MAX_CM * 2, Math.max(15, d));

/**
 * Pick the best scale for this frame. `prev` (last frame's scale) smooths the
 * auto distance so the numbers don't jump around with every landmark wobble.
 */
export function resolveLiveScale(
  lm: Landmark[] | null,
  frameW: number,
  frameH: number,
  settings: LiveMeasureSettings,
  objects: DetectedObject[] = [],
  prev: LiveScale | null = null
): LiveScale | null {
  if (!frameW) return null;
  const f = focalPx(frameW);

  if (isPlausibleStature(settings.statureCm)) {
    const pts = standingPersonPoints(lm, frameW, frameH);
    if (pts?.standing) {
      const px = pts.floor.y - pts.top.y;
      if (px > frameH * 0.3) {
        const pxPerCm = px / settings.statureCm;
        return { pxPerCm, source: 'height', distanceCm: f / pxPerCm };
      }
    }
  }

  if (settings.autoDistance) {
    let source: LiveScaleSource | null = null;
    let d = distanceFromPerson(lm, frameW, frameH, settings.statureCm);
    if (d != null) source = 'auto-person';
    else {
      d = distanceFromObjects(objects, frameW, frameH);
      if (d != null) source = 'auto-objects';
    }
    if (d != null && source) {
      d = clampDist(d);
      if (prev && prev.source === source) d = prev.distanceCm * 0.8 + d * 0.2;
      return { pxPerCm: f / d, source, distanceCm: d };
    }
  }

  const d = settings.distanceCm;
  return { pxPerCm: f / d, source: 'distance', distanceCm: d };
}

const r0 = (v: number) => Math.round(v);

/** Height × width (cm) of a normalised box. */
export function boxSizeCm(box: ErgoBox, frameW: number, frameH: number, scale: LiveScale) {
  return {
    heightCm: r0((box.h * frameH) / scale.pxPerCm),
    widthCm: r0((box.w * frameW) / scale.pxPerCm),
  };
}

/**
 * The person's box + size from pose landmarks. Standing: the full head-to-floor
 * height. Otherwise (e.g. seated) the visible span of the body.
 */
export function personSizeCm(
  lm: Landmark[] | null,
  frameW: number,
  frameH: number,
  scale: LiveScale
): { box: ErgoBox; heightCm: number; widthCm: number; standing: boolean } | null {
  if (!lm?.length) return null;
  const vis = lm.filter((p) => (p.visibility ?? 1) > 0.4);
  if (vis.length < 6) return null;
  let minX = Math.min(...vis.map((p) => p.x));
  let maxX = Math.max(...vis.map((p) => p.x));
  let minY = Math.min(...vis.map((p) => p.y));
  let maxY = Math.max(...vis.map((p) => p.y));

  const pts = standingPersonPoints(lm, frameW, frameH);
  const standing = !!pts?.standing;
  if (pts && standing) {
    minY = Math.min(minY, pts.top.y / frameH);
    maxY = Math.max(maxY, pts.floor.y / frameH);
  } else {
    // The head top is above the highest landmark (eyes/ears) — add a little.
    minY = Math.max(0, minY - (maxY - minY) * 0.08);
  }
  minX = Math.max(0, minX);
  maxX = Math.min(1, maxX);
  const box = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  return { box, ...boxSizeCm(box, frameW, frameH, scale), standing };
}

/** Draw the "H × W cm" tag under the bottom-left corner of a box (pixels). */
export function drawSizeTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bw: number,
  bh: number,
  text: string,
  color: string,
  fontPx: number
) {
  ctx.font = `700 ${fontPx}px system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const padX = fontPx * 0.45;
  const tagH = fontPx * 1.5;
  const canvasH = ctx.canvas.height;
  let ty = y + bh + 4;
  if (ty + tagH > canvasH) ty = Math.max(0, y + bh - tagH - 4); // keep on screen
  ctx.fillStyle = 'rgba(15,23,42,0.85)';
  ctx.fillRect(x, ty, tw + padX * 2, tagH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, ty, tw + padX * 2, tagH);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x + padX, ty + tagH * 0.72);

  // Dimension guides: a vertical line on the right edge, horizontal on the bottom.
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + bw + 6, y);
  ctx.lineTo(x + bw + 6, y + bh);
  ctx.moveTo(x, y + bh + 2);
  ctx.lineTo(x + bw, y + bh + 2);
  ctx.stroke();
  ctx.restore();
}

/** Font size that stays readable whatever the camera resolution. */
export function tagFontPx(frameW: number): number {
  return Math.max(14, Math.round(frameW / 48));
}

export const sizeText = (heightCm: number, widthCm: number, approx: boolean) =>
  `${approx ? '≈ ' : ''}H ${heightCm} cm × W ${widthCm} cm`;

/**
 * Draw live sizes for every detected object plus the person. `skipPersonBoxes`
 * hides the detector's own person boxes (the pose-based person tag is better).
 */
export function drawLiveSizes(
  ctx: CanvasRenderingContext2D,
  frameW: number,
  frameH: number,
  lm: Landmark[] | null,
  objects: DetectedObject[],
  scale: LiveScale | null
) {
  if (!scale) return;
  const font = tagFontPx(frameW);
  const approx = scale.source !== 'height';

  for (const o of objects) {
    if (o.type === 'person') continue; // measured from the pose below
    const s = boxSizeCm(o.box, frameW, frameH, scale);
    drawSizeTag(
      ctx,
      o.box.x * frameW,
      o.box.y * frameH,
      o.box.w * frameW,
      o.box.h * frameH,
      sizeText(s.heightCm, s.widthCm, approx),
      '#38bdf8',
      font
    );
  }

  const p = personSizeCm(lm, frameW, frameH, scale);
  if (p) {
    const x = p.box.x * frameW;
    const y = p.box.y * frameH;
    const bw = p.box.w * frameW;
    const bh = p.box.h * frameH;
    ctx.strokeStyle = 'rgba(52,211,153,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
    const label = `Person ${p.standing ? '' : '(visible) '}`;
    drawSizeTag(ctx, x, y, bw, bh, label + sizeText(p.heightCm, p.widthCm, approx), '#10b981', font);
  }
}
