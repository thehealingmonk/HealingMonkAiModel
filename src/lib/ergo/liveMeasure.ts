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

export type LiveScaleSource = 'height' | 'distance';

export interface LiveScale {
  pxPerCm: number;
  source: LiveScaleSource;
}

export interface LiveMeasureSettings {
  /** Approx. camera → subject distance (cm). */
  distanceCm: number;
  /** The person's real height (cm), if they entered it. */
  statureCm: number | null;
}

/** Scale from distance: at distance d the frame width covers 2·d·tan(fov/2) cm. */
export function pxPerCmFromDistance(frameW: number, distanceCm: number): number | null {
  if (!frameW || !(distanceCm > 0)) return null;
  const viewWidthCm = 2 * distanceCm * Math.tan(((ASSUMED_HFOV_DEG / 2) * Math.PI) / 180);
  return frameW / viewWidthCm;
}

/** Pick the best scale for this frame. */
export function resolveLiveScale(
  lm: Landmark[] | null,
  frameW: number,
  frameH: number,
  settings: LiveMeasureSettings
): LiveScale | null {
  if (isPlausibleStature(settings.statureCm)) {
    const pts = standingPersonPoints(lm, frameW, frameH);
    if (pts?.standing) {
      const px = pts.floor.y - pts.top.y;
      if (px > frameH * 0.3) return { pxPerCm: px / settings.statureCm, source: 'height' };
    }
  }
  const d = pxPerCmFromDistance(frameW, settings.distanceCm);
  return d ? { pxPerCm: d, source: 'distance' } : null;
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
  const approx = scale.source === 'distance';

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
