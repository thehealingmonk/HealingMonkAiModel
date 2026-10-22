/**
 * ErgoAI furniture fit — "is this chair / desk / screen right for this body?"
 *
 * Two layers:
 *  1. Dimension rules from the ergonomics literature, each comparing a measured
 *     furniture size to a range computed from the body (Parcells et al. 1999 seat
 *     criteria, Gouvali & Boudolos 2006, ANSI/HFES 100-2007, OSHA VDT guidance).
 *  2. A simple kinematic model of the posture that body would adopt at that
 *     furniture (forearm tilt to reach the desk, neck angle to see the screen,
 *     feet on the floor or dangling…), scored with the SAME RULA and REBA code the
 *     camera assessment uses. So "desk 8 cm too high" turns into the RULA/REBA
 *     score it would cause.
 *
 * Run once for the scanned/entered person and once for the average human of the
 * chosen population, so the report can show both side by side.
 */

import {
  BodyFitResult,
  ErgoAngles,
  ErgoManualInputs,
  ErgoObjectInputs,
  ErgoPersonInputs,
  FitCheck,
  FitReport,
  FitVerdict,
  MeasuredItem,
  MeasurementMode,
  ObjectDimKey,
  RiskBand,
} from './ergoTypes';
import { BodyDims, BodySex, bodyFromStature, isPlausibleStature, population } from './anthropometry';
import { computeRula } from './rula';
import { computeReba } from './reba';
import { defaultManualInputs, bandRank } from './ergoKnowledge';

/** Shoe allowance used by the seat criteria (Parcells: +3 cm). */
const SHOE_CM = 3;
const COS5 = Math.cos((5 * Math.PI) / 180);
const COS30 = Math.cos((30 * Math.PI) / 180);
/** Assumed half-height of the screen (≈ a 24" monitor) when only the top is known. */
const SCREEN_HALF_CM = 15;
const DEFAULT_VIEW_DIST_CM = 60;
/** Typical desktop thickness, for knee/thigh clearance underneath. */
const DESK_TOP_THICKNESS_CM = 3;

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const deg = (rad: number) => (rad * 180) / Math.PI;
const asinSafe = (v: number) => Math.asin(Math.max(-1, Math.min(1, v)));

// ---------------------------------------------------------------------------
//  Ideal ranges for a body
// ---------------------------------------------------------------------------

export interface IdealRanges {
  seatHeight: { min: number; max: number; ideal: number };
  seatDepth: { min: number; max: number; ideal: number };
  seatWidth: { min: number; max: number; ideal: number };
  /** Desk height depends on the seat actually used. */
  deskHeight: (seatCm: number) => { min: number; max: number; ideal: number };
  monitorTop: (seatCm: number) => { min: number; max: number; ideal: number };
  monitorDistance: { min: number; max: number; ideal: number };
}

export function idealRanges(b: BodyDims): IdealRanges {
  const ph = b.poplitealHeightCm + SHOE_CM;
  const seatMin = ph * COS30;
  const seatMax = ph * COS5;
  return {
    // Parcells: (PH+3)·cos30° ≤ SH ≤ (PH+3)·cos5° — lower leg 5–30° from vertical, feet flat.
    seatHeight: { min: r1(seatMin), max: r1(seatMax), ideal: r1((seatMin + seatMax) / 2 + 1) },
    // Parcells: 0.80·BPL ≤ SD ≤ 0.95·BPL — thighs supported, no pressure behind the knee.
    seatDepth: {
      min: r1(0.8 * b.buttockPoplitealLengthCm),
      max: r1(0.95 * b.buttockPoplitealLengthCm),
      ideal: r1(0.88 * b.buttockPoplitealLengthCm),
    },
    // Gouvali & Boudolos: 1.10·HB ≤ SW ≤ 1.30·HB (wider is fine — only narrow hurts).
    seatWidth: { min: r1(1.1 * b.hipBreadthCm), max: r1(1.3 * b.hipBreadthCm), ideal: r1(1.2 * b.hipBreadthCm) },
    // ANSI/HFES 100: work surface at, or just below, seated elbow height.
    deskHeight: (seat) => {
      const elbow = seat + b.sittingElbowHeightCm;
      return { min: r1(elbow - 5), max: r1(elbow + 3), ideal: r1(elbow - 1) };
    },
    // OSHA / ANSI: top of the screen at or slightly below seated eye level.
    monitorTop: (seat) => {
      const eye = seat + b.sittingEyeHeightCm;
      return { min: r1(eye - 10), max: r1(eye + 2), ideal: r1(eye - 3) };
    },
    // OSHA: 50–100 cm, ANSI ≥ 50; we flag beyond ~80 as hard to read.
    monitorDistance: { min: 50, max: 80, ideal: 60 },
  };
}

/** Band for how far (cm) a value falls outside its range. */
function bandFor(outsideCm: number, mediumAt = 3, highAt = 8): RiskBand {
  const d = Math.abs(outsideCm);
  if (d <= 0.5) return 'negligible';
  if (d <= mediumAt) return 'low';
  if (d <= highAt) return 'medium';
  return 'high';
}

function outside(v: number, min: number, max: number): number {
  if (v < min) return r1(v - min);
  if (v > max) return r1(v - max);
  return 0;
}

const modeOf = (inputs: ErgoObjectInputs, key: ObjectDimKey): MeasurementMode =>
  inputs.sources?.[key] ?? 'user-measured';

const num = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

// ---------------------------------------------------------------------------
//  Dimension checks
// ---------------------------------------------------------------------------

export function fitChecks(b: BodyDims, inputs: ErgoObjectInputs): FitCheck[] {
  const R = idealRanges(b);
  const out: FitCheck[] = [];
  const seat = inputs.chairSeatHeightCm;
  const effectiveSeat = num(seat) ? seat : R.seatHeight.ideal;
  const footrest = inputs.footrestPresent === true;

  // ---- Seat height ----
  if (num(seat)) {
    const r = R.seatHeight;
    const d = outside(seat, r.min, r.max);
    const verdict: FitVerdict = d < 0 ? 'too-low' : d > 0 ? 'too-high' : 'fits';
    let rec = `Seat height suits this body (ideal ≈ ${r0(r.ideal)} cm).`;
    if (verdict === 'too-high')
      rec = footrest
        ? `Seat is ${r0(d)} cm above the feet-flat limit — the footrest compensates; keep the whole foot on it.`
        : `Lower the seat by ~${r0(seat - r.ideal)} cm (to ≈ ${r0(r.ideal)} cm), or add a footrest about ${r0(seat - r.ideal)} cm high so the feet rest flat.`;
    if (verdict === 'too-low')
      rec = `Raise the seat by ~${r0(r.ideal - seat)} cm (to ≈ ${r0(r.ideal)} cm) so the hips sit level with or slightly above the knees.`;
    out.push({
      key: 'chairSeatHeightCm',
      object: 'chair',
      label: 'Seat height',
      measuredCm: seat,
      minCm: r.min,
      maxCm: r.max,
      idealCm: r.ideal,
      deltaCm: d,
      verdict,
      band: verdict === 'too-high' && footrest ? 'low' : bandFor(d),
      criterion: `Popliteal height ${b.poplitealHeightCm} cm + ${SHOE_CM} cm shoes → seat ${r0(r.min)}–${r0(r.max)} cm (feet flat, lower leg 5–30° from vertical).`,
      standard: 'Parcells et al. (1999) seat-height criterion',
      recommendation: rec,
      mode: modeOf(inputs, 'chairSeatHeightCm'),
    });
  }

  // ---- Seat depth ----
  if (num(inputs.seatDepthCm)) {
    const v = inputs.seatDepthCm;
    const r = R.seatDepth;
    const d = outside(v, r.min, r.max);
    const verdict: FitVerdict = d < 0 ? 'too-shallow' : d > 0 ? 'too-deep' : 'fits';
    out.push({
      key: 'seatDepthCm',
      object: 'chair',
      label: 'Seat depth',
      measuredCm: v,
      minCm: r.min,
      maxCm: r.max,
      idealCm: r.ideal,
      deltaCm: d,
      verdict,
      band: bandFor(d),
      criterion: `Buttock–popliteal length ${b.buttockPoplitealLengthCm} cm → seat depth ${r0(r.min)}–${r0(r.max)} cm.`,
      standard: 'Parcells et al. (1999) seat-depth criterion',
      recommendation:
        verdict === 'too-deep'
          ? `Seat is ${r0(d)} cm too deep — the front edge presses behind the knees or the back loses the backrest. Slide the seat pan back / add a lumbar cushion, or use a seat ≤ ${r0(r.max)} cm deep.`
          : verdict === 'too-shallow'
          ? `Seat is ${r0(-d)} cm too shallow — thighs are not supported. Use a seat at least ${r0(r.min)} cm deep.`
          : 'Seat depth supports the thighs with a gap behind the knees.',
      mode: modeOf(inputs, 'seatDepthCm'),
    });
  }

  // ---- Seat width (only too narrow is a problem) ----
  if (num(inputs.seatWidthCm)) {
    const v = inputs.seatWidthCm;
    const r = R.seatWidth;
    const d = v < r.min ? r1(v - r.min) : 0;
    const verdict: FitVerdict = d < 0 ? 'too-narrow' : 'fits';
    out.push({
      key: 'seatWidthCm',
      object: 'chair',
      label: 'Seat width',
      measuredCm: v,
      minCm: r.min,
      maxCm: r.max,
      idealCm: r.ideal,
      deltaCm: d,
      verdict,
      band: bandFor(d),
      criterion: `Hip breadth ${b.hipBreadthCm} cm → seat at least ${r0(r.min)} cm wide.`,
      standard: 'Gouvali & Boudolos (2006) seat-width criterion',
      recommendation:
        verdict === 'too-narrow'
          ? `Seat is ${r0(-d)} cm too narrow for the hips — use a seat at least ${r0(r.min)} cm wide.`
          : 'Seat is wide enough for the hips.',
      mode: modeOf(inputs, 'seatWidthCm'),
    });
  }

  // ---- Desk height (relative to the seat in use) ----
  if (num(inputs.deskHeightCm)) {
    const v = inputs.deskHeightCm;
    const r = R.deskHeight(effectiveSeat);
    const d = outside(v, r.min, r.max);
    const verdict: FitVerdict = d < 0 ? 'too-low' : d > 0 ? 'too-high' : 'fits';
    const seatNote = num(seat) ? `this ${r0(seat)} cm seat` : `an ideally set seat (${r0(effectiveSeat)} cm)`;
    let rec = 'Desk height keeps the forearms roughly horizontal.';
    if (verdict === 'too-high') {
      const raise = r0(v - r.ideal);
      rec = `Desk is ${r0(d)} cm above elbow level — lower it to ≈ ${r0(r.ideal)} cm, or raise the chair by ~${raise} cm and add a ${raise} cm footrest.`;
    }
    if (verdict === 'too-low')
      rec = `Desk is ${r0(-d)} cm below elbow level — raise it to ≈ ${r0(r.ideal)} cm (desk risers / keyboard tray), otherwise the trunk bends forward.`;
    out.push({
      key: 'deskHeightCm',
      object: 'desk',
      label: 'Desk height',
      measuredCm: v,
      minCm: r.min,
      maxCm: r.max,
      idealCm: r.ideal,
      deltaCm: d,
      verdict,
      band: bandFor(d),
      criterion: `Seated elbow height on ${seatNote} = ${r0(effectiveSeat + b.sittingElbowHeightCm)} cm → work surface ${r0(r.min)}–${r0(r.max)} cm.`,
      standard: 'ANSI/HFES 100-2007 (work surface ≈ seated elbow height)',
      recommendation: rec,
      mode: modeOf(inputs, 'deskHeightCm'),
    });

    // ---- Leg room: thighs must clear the underside of the desk ----
    const need = effectiveSeat + b.thighThicknessCm + 2;
    const have = v - DESK_TOP_THICKNESS_CM;
    if (have < need) {
      const dd = r1(have - need);
      out.push({
        key: 'thighClearance',
        object: 'desk',
        label: 'Leg room under desk',
        measuredCm: r1(have),
        minCm: r1(need),
        maxCm: r1(need + 30),
        idealCm: r1(need + 5),
        deltaCm: dd,
        verdict: 'no-legroom',
        band: bandFor(dd),
        criterion: `Seat ${r0(effectiveSeat)} cm + thigh thickness ${b.thighThicknessCm} cm + 2 cm → needs ${r0(need)} cm under the desk.`,
        standard: 'Pheasant, Bodyspace — thigh clearance',
        recommendation: `Thighs will hit the desk underside by ~${r0(-dd)} cm — lower the seat or raise the desk.`,
        mode: modeOf(inputs, 'deskHeightCm'),
      });
    }
  }

  // ---- Monitor top height (relative to seated eye level) ----
  if (num(inputs.monitorTopHeightCm)) {
    const v = inputs.monitorTopHeightCm;
    const r = R.monitorTop(effectiveSeat);
    const d = outside(v, r.min, r.max);
    const verdict: FitVerdict = d < 0 ? 'too-low' : d > 0 ? 'too-high' : 'fits';
    out.push({
      key: 'monitorTopHeightCm',
      object: 'monitor',
      label: 'Screen height',
      measuredCm: v,
      minCm: r.min,
      maxCm: r.max,
      idealCm: r.ideal,
      deltaCm: d,
      verdict,
      band: bandFor(d, 4, 10),
      criterion: `Seated eye level = ${r0(effectiveSeat + b.sittingEyeHeightCm)} cm from floor → screen top ${r0(r.min)}–${r0(r.max)} cm.`,
      standard: 'OSHA VDT eTool / ANSI/HFES 100 (top of screen at or slightly below eye level)',
      recommendation:
        verdict === 'too-low'
          ? `Raise the screen by ~${r0(r.ideal - v)} cm (top at ≈ ${r0(r.ideal)} cm) — it is pulling the head down.`
          : verdict === 'too-high'
          ? `Lower the screen by ~${r0(v - r.ideal)} cm (top at ≈ ${r0(r.ideal)} cm) — it is tipping the head back.`
          : 'Screen top sits at a comfortable height for the eyes.',
      mode: modeOf(inputs, 'monitorTopHeightCm'),
    });
  }

  // ---- Viewing distance (body-independent) ----
  if (num(inputs.monitorDistanceCm)) {
    const v = inputs.monitorDistanceCm;
    const r = R.monitorDistance;
    const d = outside(v, r.min, r.max);
    const verdict: FitVerdict = d < 0 ? 'too-close' : d > 0 ? 'too-far' : 'fits';
    out.push({
      key: 'monitorDistanceCm',
      object: 'monitor',
      label: 'Eye-to-screen distance',
      measuredCm: v,
      minCm: r.min,
      maxCm: r.max,
      idealCm: r.ideal,
      deltaCm: d,
      verdict,
      band: bandFor(d, 10, 20),
      criterion: 'Screen about an arm’s length away: 50–80 cm.',
      standard: 'OSHA VDT eTool / ANSI/HFES 100-2007',
      recommendation:
        verdict === 'too-close'
          ? `Push the screen back ~${r0(-d)} cm (to ≈ 60 cm).`
          : verdict === 'too-far'
          ? `Bring the screen ~${r0(d)} cm closer (to ≈ 60 cm) or enlarge the text.`
          : 'Viewing distance is comfortable.',
      mode: modeOf(inputs, 'monitorDistanceCm'),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
//  Predicted posture → RULA / REBA
// ---------------------------------------------------------------------------

/**
 * The seated posture this body is pushed into by these furniture sizes. Starts
 * from a neutral typing posture and bends only the joints the geometry forces.
 * Returns null when no posture-relevant dimension was measured.
 */
export function predictPosture(b: BodyDims, inputs: ErgoObjectInputs): ErgoAngles | null {
  const R = idealRanges(b);
  const seat = num(inputs.chairSeatHeightCm) ? inputs.chairSeatHeightCm : null;
  const desk = num(inputs.deskHeightCm) ? inputs.deskHeightCm : null;
  const top = num(inputs.monitorTopHeightCm) ? inputs.monitorTopHeightCm : null;
  if (seat == null && desk == null && top == null) return null;

  const effSeat = seat ?? R.seatHeight.ideal;
  const a: ErgoAngles = {
    view: 'side',
    neckFlexion: 5,
    neckSideBend: 0,
    neckTwist: null,
    trunkFlexion: 3,
    trunkSideBend: 0,
    trunkTwist: null,
    upperArmElevation: 10,
    shoulderAbduction: 0,
    shoulderRaised: false,
    lowerArmAngle: 85,
    wristAngle: 5,
    // REBA's knee-flexion modifiers are for standing; a supported seated posture
    // scores legs = 1, so we don't feed the 90° seated knee into it.
    kneeAngle: 0,
    legsSupported: true,
    confidence: 1,
  };

  // Feet: dangling when the seat is above popliteal height + shoes (no footrest).
  if (seat != null && seat > R.seatHeight.max + 1 && inputs.footrestPresent !== true) {
    a.legsSupported = false;
  }

  // Arms: the hands must reach the desk surface from the elbow.
  if (desk != null) {
    const elbow = effSeat + b.sittingElbowHeightCm;
    const d = desk - elbow; // + desk above elbow
    if (d > 0) {
      const tilt = deg(asinSafe(d / b.forearmLengthCm));
      a.lowerArmAngle = 85 + tilt; // forearm angled up → more elbow flexion
      if (d > 3) a.shoulderRaised = true; // shrug to lift the elbows
      if (d > 5) a.shoulderAbduction = deg(asinSafe((d - 5) / b.upperArmLengthCm)) + 20; // wing the elbows out
      if (d > 5) a.wristAngle = 15 + Math.min(15, d - 5); // wrists extend to reach the keys
    } else if (d < 0) {
      const drop = -d;
      const maxForearmDrop = b.forearmLengthCm * Math.sin((25 * Math.PI) / 180);
      const tilt = deg(asinSafe(Math.min(drop, maxForearmDrop) / b.forearmLengthCm));
      a.lowerArmAngle = 85 - tilt;
      const extra = drop - maxForearmDrop;
      if (extra > 0) {
        // The rest has to come from leaning the trunk forward.
        a.trunkFlexion = 3 + deg(asinSafe(extra / b.sittingShoulderHeightCm));
        a.upperArmElevation = 10 + deg(asinSafe(extra / b.upperArmLengthCm));
      }
      if (drop > 5) a.wristAngle = 10;
    }
  }

  // Neck: line of sight to the screen centre. Eyes alone cover ~15° of downward
  // gaze; beyond that the neck flexes. A screen centre above the eyes → extension.
  if (top != null) {
    const eye = effSeat + b.sittingEyeHeightCm;
    const centre = top - SCREEN_HALF_CM;
    const dist = num(inputs.monitorDistanceCm) ? inputs.monitorDistanceCm : DEFAULT_VIEW_DIST_CM;
    const gaze = deg(Math.atan2(eye - centre, dist)); // + = below horizontal
    let neck = 5;
    if (gaze > 15) neck = 5 + (gaze - 15);
    else if (gaze < 0) neck = gaze;
    // A forward-leaning trunk already lowers the head; the neck compensates less.
    a.neckFlexion = r1(neck);
  }

  a.lowerArmAngle = a.lowerArmAngle == null ? null : r1(a.lowerArmAngle);
  a.trunkFlexion = a.trunkFlexion == null ? null : r1(a.trunkFlexion);
  a.upperArmElevation = a.upperArmElevation == null ? null : r1(a.upperArmElevation);
  a.shoulderAbduction = a.shoulderAbduction == null ? null : r1(a.shoulderAbduction);
  return a;
}

// ---------------------------------------------------------------------------
//  Whole-body result + report
// ---------------------------------------------------------------------------

const VERDICT_WORD: Record<FitVerdict, string> = {
  fits: 'fits',
  'too-low': 'too low',
  'too-high': 'too high',
  'too-shallow': 'too shallow',
  'too-deep': 'too deep',
  'too-narrow': 'too narrow',
  'too-close': 'too close',
  'too-far': 'too far',
  'no-legroom': 'no leg room',
};

export function assessBodyFit(
  who: 'person' | 'average',
  label: string,
  statureCm: number,
  statureMode: MeasurementMode,
  sex: BodySex,
  inputs: ErgoObjectInputs,
  manual: ErgoManualInputs = defaultManualInputs
): BodyFitResult {
  const dims = bodyFromStature(statureCm, sex);
  const checks = fitChecks(dims, inputs);
  const angles = predictPosture(dims, inputs);
  const predicted = angles ? { angles, rula: computeRula(angles, manual), reba: computeReba(angles, manual) } : null;

  let suitable: boolean | null = null;
  let summary = 'No furniture measured yet — measure at least the seat or desk height.';
  if (checks.length > 0) {
    const bad = checks.filter((c) => bandRank(c.band) >= bandRank('medium'));
    suitable = bad.length === 0;
    summary = suitable
      ? 'Workstation suits this body' +
        (checks.some((c) => c.verdict !== 'fits') ? ' (small deviations only).' : '.')
      : 'Does not suit: ' +
        bad.map((c) => `${c.label.toLowerCase()} ${VERDICT_WORD[c.verdict]} by ${Math.abs(r0(c.deltaCm))} cm`).join(', ') +
        '.';
  }

  return { who, label, statureCm: r1(statureCm), statureMode, dims, checks, predicted, suitable, summary };
}

export function buildFitReport(
  person: ErgoPersonInputs,
  inputs: ErgoObjectInputs,
  items: MeasuredItem[] = [],
  manual: ErgoManualInputs = defaultManualInputs
): FitReport {
  const pop = population(person.population);
  const average = assessBodyFit('average', pop.label, pop.statureCm, 'estimated', pop.sex, inputs, manual);
  const personFit = isPlausibleStature(person.statureCm)
    ? assessBodyFit('person', 'This person', person.statureCm, person.statureMode, pop.sex, inputs, manual)
    : null;
  return {
    person: personFit,
    average,
    shoulderWidthCm: person.shoulderWidthCm,
    shoulderMode: person.shoulderMode,
    items,
  };
}

/** True when anything worth comparing was measured. */
export function hasFitData(inputs: ErgoObjectInputs, person: ErgoPersonInputs, items: MeasuredItem[]): boolean {
  return (
    [
      inputs.chairSeatHeightCm,
      inputs.seatDepthCm,
      inputs.seatWidthCm,
      inputs.deskHeightCm,
      inputs.monitorTopHeightCm,
      inputs.monitorDistanceCm,
    ].some(num) ||
    isPlausibleStature(person.statureCm) ||
    items.length > 0
  );
}
