import { Landmark } from '@/lib/poseDetection';
import type { ClinicalPlumbLine } from '@/lib/plumbLine';
import type { PositionCheck } from '@/lib/positionCheck';

/**
 * Live positioning coach for the camera screen. Looks at the tracked body and
 * the plumb line and tells the user, in plain language + a big on-screen arrow,
 * how to stand: come into frame, centre yourself, step back so the whole body
 * fits, or stand tall. This turns the raw skeleton into friendly guidance —
 * important because the person is usually too far from the screen to read text.
 */

export type GuidanceStatus =
  | 'no-body'
  | 'wrong-position'
  | 'body-incomplete'
  | 'move-left'
  | 'move-right'
  | 'step-back'
  | 'come-closer'
  | 'align'
  | 'correct';

export interface Guidance {
  status: GuidanceStatus;
  en: string;
  hi: string;
  /** Big directional arrow to draw, if any. */
  arrow: 'left' | 'right' | null;
  /** true when the user is well-positioned and can hold still / capture. */
  ready: boolean;
  /** Body parts the camera cannot see in this frame (empty = full body visible). */
  missingParts?: MissingBodyPart[];
  /** Set when the patient is not in the position this assessment needs. */
  position?: PositionCheck;
}

// ---------- Full-body visibility check ----------

export interface MissingBodyPart {
  /** Stable id, e.g. "left-knee" / "knee" (side view). */
  id: string;
  en: string;
  hi: string;
  /** Coarse region, used for the short on-screen summary. */
  region: BodyRegion;
}

export type BodyRegion = 'head' | 'torso' | 'arms' | 'legs';

const REGION_TEXT: Record<BodyRegion, { en: string; hi: string }> = {
  head: { en: 'Head', hi: 'सिर' },
  torso: { en: 'Shoulders / hips', hi: 'कंधे / कूल्हे' },
  arms: { en: 'Arms / hands', hi: 'हाथ' },
  legs: { en: 'Legs / feet', hi: 'पैर' },
};

interface PartDef {
  id: string;
  en: string;
  hi: string;
  region: BodyRegion;
  left?: number[];
  right?: number[];
  /** Midline parts (head) — visible if ANY of these points is visible. */
  any?: number[];
}

// MediaPipe Pose indices. "left/right" = the PERSON's left/right.
const BODY_PARTS: PartDef[] = [
  { id: 'head', en: 'Head', hi: 'सिर', region: 'head', any: [0, 2, 5, 7, 8] },
  { id: 'shoulder', en: 'shoulder', hi: 'कंधा', region: 'torso', left: [11], right: [12] },
  { id: 'elbow', en: 'elbow', hi: 'कोहनी', region: 'arms', left: [13], right: [14] },
  { id: 'wrist', en: 'wrist / hand', hi: 'कलाई / हाथ', region: 'arms', left: [15], right: [16] },
  { id: 'hip', en: 'hip', hi: 'कूल्हा', region: 'torso', left: [23], right: [24] },
  { id: 'knee', en: 'knee', hi: 'घुटना', region: 'legs', left: [25], right: [26] },
  { id: 'ankle', en: 'ankle', hi: 'टखना', region: 'legs', left: [27], right: [28] },
  { id: 'foot', en: 'foot', hi: 'पंजा', region: 'legs', left: [29, 31], right: [30, 32] },
];

const PART_VIS_MIN = 0.4;
const EDGE = 0.01;

/** A landmark counts as seen only if the model is confident AND it lies inside the frame. */
function pointSeen(l?: Landmark): boolean {
  if (!l) return false;
  if ((l.visibility ?? 1) < PART_VIS_MIN) return false;
  return l.x >= -EDGE && l.x <= 1 + EDGE && l.y >= -EDGE && l.y <= 1 + EDGE;
}
const groupSeen = (lm: Landmark[], idx: number[]) => idx.some((i) => pointSeen(lm[i]));

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Which body parts are NOT visible in this frame. In a side view the far-side
 * limb is naturally hidden behind the body, so left/right are merged and a part
 * is only reported missing when NEITHER side can be seen.
 */
export function detectMissingBodyParts(
  lm: Landmark[] | null | undefined,
  view: 'front' | 'side' | 'back' = 'front'
): MissingBodyPart[] {
  const out: MissingBodyPart[] = [];
  for (const p of BODY_PARTS) {
    if (p.any) {
      // From behind the face points get low visibility even when the head is in
      // shot, so for a back view only require the head to be inside the frame.
      const seen =
        !!lm &&
        (view === 'back'
          ? p.any.some((i) => lm[i] && lm[i].y >= -EDGE && lm[i].y <= 1 + EDGE && lm[i].x >= -EDGE && lm[i].x <= 1 + EDGE)
          : groupSeen(lm, p.any));
      if (!seen) out.push({ id: p.id, en: p.en, hi: p.hi, region: p.region });
      continue;
    }
    const l = !!lm && groupSeen(lm, p.left!);
    const r = !!lm && groupSeen(lm, p.right!);
    if (view === 'side') {
      if (!l && !r) out.push({ id: p.id, en: cap(p.en), hi: p.hi, region: p.region });
    } else {
      if (!l) out.push({ id: `left-${p.id}`, en: `Left ${p.en}`, hi: `बायां ${p.hi}`, region: p.region });
      if (!r) out.push({ id: `right-${p.id}`, en: `Right ${p.en}`, hi: `दायां ${p.hi}`, region: p.region });
    }
  }
  return out;
}

/** Short region summary for the live alert, e.g. "Legs / feet, Arms / hands". */
export function summarizeMissing(parts: MissingBodyPart[]): { en: string; hi: string } {
  const regions = Array.from(new Set(parts.map((p) => p.region)));
  return {
    en: regions.map((r) => REGION_TEXT[r].en).join(', '),
    hi: regions.map((r) => REGION_TEXT[r].hi).join(', '),
  };
}

// Key body points used to gauge framing: nose, shoulders, hips, knees, ankles.
const KEY = [0, 11, 12, 23, 24, 25, 26, 27, 28];
const vv = (l?: Landmark) => l?.visibility ?? 1;

export function computeGuidance(
  lm: Landmark[],
  plumb: ClinicalPlumbLine | null,
  view: 'front' | 'side' | 'back' = plumb?.view ?? 'front',
  position: PositionCheck | null = null
): Guidance {
  const pts = KEY.map((i) => lm[i]).filter((p) => p && vv(p) > 0.3);
  if (pts.length < 4) {
    return {
      status: 'no-body',
      en: 'Stand in front of the camera',
      hi: 'कैमरे के सामने खड़े हों',
      arrow: null,
      ready: false,
    };
  }

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bodyH = maxY - minY;
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;

  // Wrong pose for this assessment (e.g. facing front when a side view is
  // needed): say what is wrong AND how to stand instead.
  if (position && !position.correct && position.problem) {
    return {
      status: 'wrong-position',
      en: `${position.problem.en}. ${position.suggestion.en}`,
      hi: `${position.problem.hi}। ${position.suggestion.hi}`,
      arrow: null,
      ready: false,
      position,
    };
  }

  // Whole body must be visible: every body part (head, arms, legs, feet) seen.
  // Name exactly what is missing so the user knows what to fix.
  const missing = detectMissingBodyParts(lm, view);
  if (missing.length) {
    const s = summarizeMissing(missing);
    return {
      status: 'body-incomplete',
      en: `Full body not visible — ${s.en} not in view. Step back`,
      hi: `पूरा शरीर नहीं दिख रहा — ${s.hi} नहीं दिख रहे। थोड़ा पीछे हटें`,
      arrow: null,
      ready: false,
      missingParts: missing,
    };
  }

  // Head not clipped at the top and the body not so large it overflows the edges.
  if (minY < 0.04 || bodyH > 0.92) {
    return {
      status: 'step-back',
      en: 'Step back — fit your whole body in the frame',
      hi: 'थोड़ा पीछे हटें — पूरा शरीर फ्रेम में लाएं',
      arrow: null,
      ready: false,
    };
  }
  if (bodyH < 0.5) {
    return {
      status: 'come-closer',
      en: 'Come a little closer',
      hi: 'थोड़ा पास आएं',
      arrow: null,
      ready: false,
    };
  }

  // Centre the body horizontally in the frame.
  if (centerX < 0.4) {
    return {
      status: 'move-right',
      en: 'Move to your right to centre yourself',
      hi: 'बीच में आने के लिए दाईं ओर आएं',
      arrow: 'right',
      ready: false,
    };
  }
  if (centerX > 0.6) {
    return {
      status: 'move-left',
      en: 'Move to your left to centre yourself',
      hi: 'बीच में आने के लिए बाईं ओर आएं',
      arrow: 'left',
      ready: false,
    };
  }

  // In frame and centred — nudge toward a clean, upright stance.
  if (plumb && !plumb.aligned) {
    return {
      status: 'align',
      en: 'Stand tall and straight',
      hi: 'सीधे तनकर खड़े हों',
      arrow: null,
      ready: false,
    };
  }

  return {
    status: 'correct',
    en: 'Perfect — hold still',
    hi: 'बिल्कुल सही — स्थिर रहें',
    arrow: null,
    ready: true,
  };
}

/**
 * Draw the big directional arrow onto a DEDICATED overlay canvas (kept separate
 * from the skeleton canvas so the guidance arrow never ends up baked into the
 * captured report photo). Sizes/clears the canvas to the video each call.
 */
export function drawGuidanceOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  g: Guidance | null
) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!g || !g.arrow) return;

  const dir = g.arrow === 'right' ? 1 : -1;
  const cy = h * 0.5;
  const midX = w * 0.5;
  const half = w * 0.13;
  const tail = midX - dir * half;
  const tip = midX + dir * half;
  const lw = Math.max(6, w * 0.014);
  const head = w * 0.035;

  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.fillStyle = '#f59e0b';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10;

  // Shaft
  ctx.beginPath();
  ctx.moveTo(tail, cy);
  ctx.lineTo(tip - dir * head, cy);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(tip, cy);
  ctx.lineTo(tip - dir * head, cy - head);
  ctx.lineTo(tip - dir * head, cy + head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
