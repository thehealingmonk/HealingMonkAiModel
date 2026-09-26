/**
 * HealingMonk ErgoAI — shared types for the ergonomic risk assessment add-on.
 *
 * This is a NEW, self-contained flow. Nothing here touches the clinical
 * assessment engine — it only reuses the low-level pose primitives from
 * `@/lib/poseDetection` (landmarks + angle maths).
 *
 * The clinical product asks "is posture close to ideal?". Ergonomics asks
 * "does posture + force + repetition + duration create an unacceptable risk?".
 * So the result shape below carries not just angles but the recognised-standard
 * scores (RULA / REBA / NIOSH) plus a merged, human-readable action plan.
 */

// ---- Environment & task catalog -------------------------------------------

export type ErgoEnvironment =
  | 'office'
  | 'manufacturing'
  | 'warehouse'
  | 'laboratory'
  | 'healthcare'
  | 'other';

export type ErgoTask =
  | 'computer'
  | 'assembly'
  | 'lifting'
  | 'packing'
  | 'machine'
  | 'material-handling'
  | 'other';

/** Which recognised standard(s) a task is scored against. */
export type ErgoMethod = 'RULA' | 'REBA' | 'NIOSH';

// ---- Camera-derived joint angles ------------------------------------------

/**
 * Neutral-anatomy joint angles extracted from a single pose frame. All in
 * degrees, measured so that 0 ≈ neutral standing posture. `side` records which
 * view the frame was taken from, since sagittal (side) angles and coronal
 * (front) angles are read from different landmark pairs.
 *
 * A value may be null when the driving landmarks weren't confidently visible;
 * the scorers fall back to a neutral assumption and flag lower confidence.
 */
export interface ErgoAngles {
  view: 'side' | 'front';
  /** Neck flexion/extension. + = flexion (chin toward chest). */
  neckFlexion: number | null;
  /** Neck side-bend (front view). */
  neckSideBend: number | null;
  /** Neck twist — camera can rarely see this; usually from manual input. */
  neckTwist: number | null;
  /** Trunk flexion/extension. + = forward bend. */
  trunkFlexion: number | null;
  /** Trunk lateral side-bend (front view). */
  trunkSideBend: number | null;
  /** Trunk twist/rotation — usually from manual input. */
  trunkTwist: number | null;
  /** Upper-arm elevation from the vertical torso line (shoulder flexion). */
  upperArmElevation: number | null;
  /** Shoulder abduction (arm away from body, front view). */
  shoulderAbduction: number | null;
  /** Whether the shoulder appears raised/shrugged. */
  shoulderRaised: boolean;
  /** Lower-arm (elbow) angle — the included forearm/upper-arm angle. */
  lowerArmAngle: number | null;
  /** Wrist flexion/extension estimate. */
  wristAngle: number | null;
  /** Knee angle (used by REBA leg score / squat detection). */
  kneeAngle: number | null;
  /** Are both feet/legs providing a stable base (bilateral weight-bearing)? */
  legsSupported: boolean;
  /** Mean landmark visibility for the joints that drove these angles (0–1). */
  confidence: number;
}

// ---- Manual (non-visual) inputs -------------------------------------------

/**
 * Factors the camera cannot see but the standards require. Sensible neutral
 * defaults live in `ergoKnowledge.defaultManualInputs` so a report can still be
 * produced from posture alone.
 */
export interface ErgoManualInputs {
  /** Load / force handled, in kg. */
  loadKg: number;
  /** REBA/RULA load qualifiers. */
  loadStatic: boolean; // held statically > ~1 min or repeated
  shockOrRapid: boolean; // sudden or jerky force build-up
  /** Coupling quality of the grip on the load/handle. */
  coupling: 'good' | 'fair' | 'poor' | 'unacceptable';
  /** Repetition — actions per minute for this task. */
  actionsPerMinute: number;
  /** Total time spent in this posture/task per day, in hours. */
  durationHoursPerDay: number;
  /** Explicit trunk twist present (adds to REBA/RULA when camera can't judge). */
  trunkTwisted: boolean;
  /** Explicit neck twist/side-bend present. */
  neckTwisted: boolean;

  // NIOSH lifting-equation specifics (only used for lifting/material-handling):
  /** Horizontal distance hand-to-ankles at origin, cm. */
  horizontalCm: number;
  /** Vertical height of hands at origin, cm. */
  verticalCm: number;
  /** Vertical travel distance of the lift, cm. */
  travelCm: number;
  /** Asymmetry angle of the lift, degrees. */
  asymmetryDeg: number;
  /** Lifts per minute (NIOSH frequency). */
  liftsPerMinute: number;
}

// ---- Per-method results ----------------------------------------------------

export type RiskBand = 'negligible' | 'low' | 'medium' | 'high' | 'very-high';

export interface RulaResult {
  method: 'RULA';
  scoreA: number; // arm & wrist score
  scoreB: number; // neck, trunk & leg score
  grandScore: number; // 1–7
  actionLevel: 1 | 2 | 3 | 4;
  band: RiskBand;
  message: string;
}

export interface RebaResult {
  method: 'REBA';
  scoreA: number; // trunk, neck, legs
  scoreB: number; // arms, wrist, coupling
  grandScore: number; // 1–15
  actionLevel: 0 | 1 | 2 | 3 | 4;
  band: RiskBand;
  message: string;
  /** Per body-segment sub-score, used to colour the highest-risk segment. */
  segments: { segment: ErgoSegment; score: number }[];
}

export interface NioshResult {
  method: 'NIOSH';
  rwlKg: number; // recommended weight limit
  liftingIndex: number; // load / RWL
  band: RiskBand;
  message: string;
  /** The six multipliers, for transparency. */
  multipliers: { HM: number; VM: number; DM: number; AM: number; FM: number; CM: number };
}

/** Body segments we can highlight on the skeleton overlay. */
export type ErgoSegment =
  | 'neck'
  | 'trunk'
  | 'left-upper-arm'
  | 'right-upper-arm'
  | 'left-lower-arm'
  | 'right-lower-arm'
  | 'legs';

// ---- Merged result ---------------------------------------------------------

export interface ErgoCategoryRisk {
  category: 'Posture' | 'Force / Load' | 'Repetition' | 'Duration' | 'Recovery';
  band: RiskBand;
  detail: string;
}

export interface ErgoRecommendation {
  priority: 1 | 2 | 3; // 1 immediate, 2 recommended, 3 monitor
  text: string;
}

export interface ErgoResult {
  environment: ErgoEnvironment;
  task: ErgoTask;
  methods: ErgoMethod[];
  rula?: RulaResult;
  reba?: RebaResult;
  niosh?: NioshResult;
  /** Worst band across everything — drives the headline traffic-light. */
  overall: RiskBand;
  overallScore: number; // 0–100 (higher = worse) for a single comparable number
  categories: ErgoCategoryRisk[];
  primaryFactors: string[];
  recommendations: ErgoRecommendation[];
  /** Which segment to paint red on the live skeleton (highest REBA sub-score). */
  worstSegment: ErgoSegment | null;
  confidence: number;
  generatedAt: number;
}
