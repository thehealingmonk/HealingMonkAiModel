import type { Landmark } from '@/lib/poseDetection';

/**
 * Checks whether the patient is in the position the current assessment needs
 * (facing front / back / sideways, standing / sitting / lying) and, if not,
 * says what is wrong and how to stand instead.
 *
 * All geometry runs on ASPECT-CORRECTED landmarks (toIsotropic), so distances
 * in x and y are comparable. MediaPipe left/right are the PERSON's left/right.
 */

export type Facing = 'front' | 'back' | 'side-left' | 'side-right' | 'side' | 'unknown';
export type Posture = 'standing' | 'sitting' | 'lying' | 'unknown';

export interface DetectedPosition {
  facing: Facing;
  posture: Posture;
}

export interface PositionRequirement {
  view: 'front' | 'side' | 'back';
  sideFacing?: 'left' | 'right';
  patientPosition: string;
}

export interface PositionCheck {
  correct: boolean;
  detected: DetectedPosition;
  /** What is wrong right now, e.g. "You are facing the camera". Null when correct. */
  problem: { en: string; hi: string } | null;
  /** How the patient should stand/sit/lie for this assessment. */
  suggestion: { en: string; hi: string };
}

const deg = (r: number) => (r * 180) / Math.PI;
const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const vis = (l?: Landmark) => l?.visibility ?? 1;

/** Angle (0–90°) of a segment from the vertical. */
function fromVertical(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y) || 1e-6;
  return deg(Math.atan2(dx, dy));
}

/** Shoulder span / torso length below this = sideways; above FRONTAL_RATIO = facing front/back. */
const SIDE_RATIO = 0.35;
const FRONTAL_RATIO = 0.5;

export function detectBodyPosition(lm: Landmark[] | null | undefined): DetectedPosition {
  const unknown: DetectedPosition = { facing: 'unknown', posture: 'unknown' };
  if (!lm) return unknown;
  const [ls, rs, lh, rh] = [lm[11], lm[12], lm[23], lm[24]];
  if (!ls || !rs || !lh || !rh) return unknown;
  // Need at least one shoulder and one hip clearly tracked.
  if (Math.max(vis(ls), vis(rs)) < 0.5 || Math.max(vis(lh), vis(rh)) < 0.5) return unknown;

  const sMid = mid(ls, rs);
  const hMid = mid(lh, rh);
  const torso = dist(sMid, hMid);
  if (torso < 1e-3) return unknown;

  // ---- Facing ----
  const ratio = dist(ls, rs) / torso;
  let facing: Facing = 'unknown';
  if (ratio > FRONTAL_RATIO) {
    // Facing the camera, the person's LEFT shoulder appears on the image RIGHT.
    const shoulderOrder = ls.x - rs.x;
    const hipOrder = lh.x - rh.x;
    const score = Math.sign(shoulderOrder) + Math.sign(hipOrder);
    facing = score > 0 ? 'front' : score < 0 ? 'back' : 'unknown';
  } else if (ratio < SIDE_RATIO) {
    // Which side is nearer the camera: smaller z = closer; the near side is
    // also tracked with higher visibility.
    const dz = ((rs.z ?? 0) - (ls.z ?? 0) + ((rh.z ?? 0) - (lh.z ?? 0))) / 2;
    const dv = (vis(ls) - vis(rs) + (vis(lh) - vis(rh))) / 2;
    const leftScore = dz * 5 + dv;
    facing = leftScore > 0.15 ? 'side-left' : leftScore < -0.15 ? 'side-right' : 'side';
  }

  // ---- Posture ----
  let posture: Posture = 'unknown';
  const torsoTilt = fromVertical(sMid, hMid);
  const ankles = [lm[27], lm[28]].filter((a): a is Landmark => !!a && vis(a) > 0.4);
  const thighs = ([[lh, lm[25]], [rh, lm[26]]] as [Landmark, Landmark | undefined][])
    .filter(([h, k]) => !!k && vis(h) > 0.4 && vis(k) > 0.4)
    .map(([h, k]) => fromVertical(h, k!));

  if (torsoTilt > 60) {
    // Torso horizontal: lying only if a leg also lies flat (ankle near hip
    // height) — this keeps a toe-touch / forward bend from reading as lying.
    if (ankles.some((a) => Math.abs(a.y - hMid.y) < 0.35 * torso)) posture = 'lying';
  } else if (torsoTilt < 45 && thighs.length) {
    if (thighs.every((t) => t > 55)) posture = 'sitting';
    else if (thighs.every((t) => t < 25)) posture = 'standing';
  }

  return { facing, posture };
}

/**
 * Rolling majority over recent frames so one noisy frame can't flip the
 * verdict. A value is reported only when it holds in ≥ 60 % of the window.
 */
export class PositionStabilizer {
  private buf: DetectedPosition[] = [];
  private key = '';
  constructor(private size = 15) {}

  push(d: DetectedPosition, key: string): DetectedPosition {
    if (key !== this.key) {
      this.key = key;
      this.buf = [];
    }
    this.buf.push(d);
    if (this.buf.length > this.size) this.buf.shift();
    return this.current();
  }

  reset() {
    this.buf = [];
  }

  current(): DetectedPosition {
    if (this.buf.length < Math.min(8, this.size)) return { facing: 'unknown', posture: 'unknown' };
    const major = <T extends string>(vals: T[], fallback: T): T => {
      const c = new Map<T, number>();
      vals.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
      let best = fallback;
      let n = 0;
      c.forEach((cnt, v) => {
        if (cnt > n) {
          n = cnt;
          best = v;
        }
      });
      return n / vals.length >= 0.6 ? best : fallback;
    };
    return {
      facing: major(this.buf.map((b) => b.facing), 'unknown'),
      posture: major(this.buf.map((b) => b.posture), 'unknown'),
    };
  }
}

function requiredPosture(p: string): 'standing' | 'sitting' | 'lying' {
  const s = p.toLowerCase();
  if (/(lie|lying|supine|prone)/.test(s)) return 'lying';
  if (/sit/.test(s)) return 'sitting';
  return 'standing';
}

const FACING_TEXT: Record<Exclude<Facing, 'unknown'>, { en: string; hi: string }> = {
  front: { en: 'facing the camera', hi: 'कैमरे की ओर मुंह करके' },
  back: { en: 'with your back to the camera', hi: 'कैमरे की ओर पीठ करके' },
  'side-left': { en: 'with your LEFT side to the camera', hi: 'बायां हिस्सा कैमरे की ओर करके' },
  'side-right': { en: 'with your RIGHT side to the camera', hi: 'दायां हिस्सा कैमरे की ओर करके' },
  side: { en: 'sideways to the camera', hi: 'कैमरे की ओर साइड करके' },
};

const POSTURE_TEXT = {
  standing: { en: 'standing', hi: 'खड़े हैं', verbEn: 'Stand', verbHi: 'खड़े हों' },
  sitting: { en: 'sitting', hi: 'बैठे हैं', verbEn: 'Sit', verbHi: 'बैठें' },
  lying: { en: 'lying down', hi: 'लेटे हैं', verbEn: 'Lie on your back', verbHi: 'पीठ के बल लेटें' },
};

/** "Stand with your LEFT side to the camera" — the correct position for this assessment. */
export function positionSuggestion(req: PositionRequirement): { en: string; hi: string } {
  const posture = POSTURE_TEXT[requiredPosture(req.patientPosition)];
  const facingKey: Exclude<Facing, 'unknown'> =
    req.view === 'side' ? (req.sideFacing ? (`side-${req.sideFacing}` as const) : 'side') : req.view;
  const f = FACING_TEXT[facingKey];
  return { en: `${posture.verbEn} ${f.en}`, hi: `${f.hi} ${posture.verbHi}` };
}

export function checkPosition(detected: DetectedPosition, req: PositionRequirement): PositionCheck {
  const suggestion = positionSuggestion(req);
  const want = requiredPosture(req.patientPosition);

  // Posture first — it is the bigger mistake. Standing assessments include
  // squats/lunges (thighs horizontal), so for them only "lying" is flagged.
  const p = detected.posture;
  const postureWrong =
    p !== 'unknown' &&
    p !== want &&
    (want !== 'standing' || p === 'lying');
  if (postureWrong) {
    return {
      correct: false,
      detected,
      problem: {
        en: `Wrong position — you are ${POSTURE_TEXT[p as Exclude<Posture, 'unknown'>].en}`,
        hi: `गलत पोज़िशन — आप ${POSTURE_TEXT[p as Exclude<Posture, 'unknown'>].hi}`,
      },
      suggestion,
    };
  }

  const f = detected.facing;
  let facingWrong = false;
  if (f !== 'unknown') {
    if (req.view === 'side') {
      if (f === 'front' || f === 'back') facingWrong = true;
      else if (req.sideFacing && f !== 'side' && f !== `side-${req.sideFacing}`) facingWrong = true;
    } else if (f !== req.view) {
      facingWrong = true;
    }
  }
  if (facingWrong) {
    const t = FACING_TEXT[f as Exclude<Facing, 'unknown'>];
    return {
      correct: false,
      detected,
      problem: { en: `Wrong position — you are ${t.en}`, hi: `गलत पोज़िशन — आप ${t.hi} हैं` },
      suggestion,
    };
  }

  return { correct: true, detected, problem: null, suggestion };
}
