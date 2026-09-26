/**
 * RULA — Rapid Upper Limb Assessment (McAtamney & Corlett, 1993).
 *
 * Best suited to seated computer / bench work where the upper limb dominates the
 * risk. Produces a grand score 1–7 and an action level 1–4.
 *
 * The lookup tables below are the published RULA Table A (arm & wrist),
 * Table B (neck, trunk & legs) and Table C (grand score). Scores are auditable
 * against the standard worksheet.
 */

import { ErgoAngles, ErgoManualInputs, RulaResult, RiskBand } from './ergoTypes';

// Table A[upperArm-1][lowerArm-1][wrist-1][wristTwist-1]  (upperArm 1-6, lowerArm 1-3, wrist 1-4, twist 1-2)
const TABLE_A: number[][][][] = [
  // Upper arm 1
  [
    [[1, 2], [2, 2], [2, 3], [3, 3]],
    [[2, 2], [2, 2], [3, 3], [3, 3]],
    [[2, 3], [3, 3], [3, 3], [4, 4]],
  ],
  // Upper arm 2
  [
    [[2, 3], [3, 3], [3, 4], [4, 4]],
    [[3, 3], [3, 3], [3, 4], [4, 4]],
    [[3, 4], [4, 4], [4, 4], [5, 5]],
  ],
  // Upper arm 3
  [
    [[3, 3], [4, 4], [4, 4], [5, 5]],
    [[3, 4], [4, 4], [4, 4], [5, 5]],
    [[4, 4], [4, 4], [4, 5], [5, 5]],
  ],
  // Upper arm 4
  [
    [[4, 4], [4, 4], [4, 5], [5, 5]],
    [[4, 4], [4, 4], [4, 5], [5, 5]],
    [[4, 4], [4, 5], [5, 5], [6, 6]],
  ],
  // Upper arm 5
  [
    [[5, 5], [5, 5], [5, 6], [6, 7]],
    [[5, 6], [6, 6], [6, 7], [7, 7]],
    [[6, 6], [6, 7], [7, 7], [7, 8]],
  ],
  // Upper arm 6
  [
    [[7, 7], [7, 7], [7, 8], [8, 9]],
    [[8, 8], [8, 8], [8, 9], [9, 9]],
    [[9, 9], [9, 9], [9, 9], [9, 9]],
  ],
];

// Table B[neck-1][trunk-1][legs-1]  (neck 1-6, trunk 1-6, legs 1-2)
const TABLE_B: number[][][] = [
  [[1, 3], [2, 3], [3, 4], [5, 5], [6, 6], [7, 7]],
  [[2, 3], [2, 3], [4, 5], [5, 5], [6, 7], [7, 7]],
  [[3, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 7]],
  [[5, 5], [5, 6], [6, 7], [7, 7], [7, 7], [8, 8]],
  [[7, 7], [7, 7], [7, 8], [8, 8], [8, 8], [8, 8]],
  [[8, 8], [8, 8], [8, 8], [8, 9], [9, 9], [9, 9]],
];

// Table C[scoreA-1][scoreB-1]  (both clamped to 1-8 / 1-7)
const TABLE_C: number[][] = [
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function upperArmScore(a: ErgoAngles): number {
  const deg = a.upperArmElevation ?? 0;
  let s: number;
  if (deg <= 20) s = 1;
  else if (deg <= 45) s = 2;
  else if (deg <= 90) s = 3;
  else s = 4;
  if (a.shoulderRaised) s += 1;
  if ((a.shoulderAbduction ?? 0) > 45) s += 1;
  return clamp(s, 1, 6);
}

function lowerArmScore(a: ErgoAngles): number {
  const deg = a.lowerArmAngle ?? 80; // flexion from straight; 80 = comfortable
  // 60–100° of elbow flexion is optimal.
  return deg >= 60 && deg <= 100 ? 1 : 2;
}

function wristScore(a: ErgoAngles): number {
  const deg = a.wristAngle ?? 0;
  if (deg <= 5) return 1;
  if (deg <= 15) return 2;
  return 3;
}

function neckScore(a: ErgoAngles, m: ErgoManualInputs): number {
  const deg = a.neckFlexion ?? 0;
  let s: number;
  if (deg <= 10) s = 1;
  else if (deg <= 20) s = 2;
  else s = 3;
  if (m.neckTwisted || a.neckTwist) s += 1;
  if ((a.neckSideBend ?? 0) > 10) s += 1;
  return clamp(s, 1, 6);
}

function trunkScore(a: ErgoAngles, m: ErgoManualInputs): number {
  const deg = a.trunkFlexion ?? 0;
  let s: number;
  if (deg <= 5) s = 1;
  else if (deg <= 20) s = 2;
  else if (deg <= 60) s = 3;
  else s = 4;
  if (m.trunkTwisted || a.trunkTwist) s += 1;
  if ((a.trunkSideBend ?? 0) > 10) s += 1;
  return clamp(s, 1, 6);
}

function legsScore(a: ErgoAngles): number {
  return a.legsSupported ? 1 : 2;
}

/** RULA muscle-use score: +1 for static or repetitive (>4/min) postures. */
function muscleUse(m: ErgoManualInputs): number {
  return m.loadStatic || m.actionsPerMinute > 4 ? 1 : 0;
}

/** RULA force/load score (0–3). */
function forceLoad(m: ErgoManualInputs): number {
  const staticOrRepeated = m.loadStatic || m.actionsPerMinute > 4;
  if (m.shockOrRapid || (m.loadKg >= 10 && staticOrRepeated)) return 3;
  if (m.loadKg >= 10 || (m.loadKg >= 2 && staticOrRepeated)) return 2;
  if (m.loadKg >= 2) return 1;
  return 0;
}

function bandFor(grand: number): { band: RiskBand; level: 1 | 2 | 3 | 4; message: string } {
  if (grand <= 2)
    return { band: 'low', level: 1, message: 'Acceptable posture if not maintained/repeated for long periods.' };
  if (grand <= 4)
    return { band: 'medium', level: 2, message: 'Further investigation needed; changes may be required.' };
  if (grand <= 6)
    return { band: 'high', level: 3, message: 'Investigate and change the workstation soon.' };
  return { band: 'very-high', level: 4, message: 'Investigate and implement change immediately.' };
}

export function computeRula(angles: ErgoAngles, manual: ErgoManualInputs): RulaResult {
  const ua = upperArmScore(angles);
  const la = lowerArmScore(angles);
  const wr = wristScore(angles);
  const wtwist = 1; // wrist pronation/supination not observable from pose — assume neutral.

  const tableA = TABLE_A[ua - 1][la - 1][wr - 1][wtwist - 1];
  const scoreA = clamp(tableA + muscleUse(manual) + forceLoad(manual), 1, 8);

  const nk = neckScore(angles, manual);
  const tr = trunkScore(angles, manual);
  const lg = legsScore(angles);
  const tableB = TABLE_B[nk - 1][tr - 1][lg - 1];
  const scoreB = clamp(tableB + muscleUse(manual) + forceLoad(manual), 1, 7);

  const grand = TABLE_C[scoreA - 1][scoreB - 1];
  const { band, level, message } = bandFor(grand);

  return {
    method: 'RULA',
    scoreA,
    scoreB,
    grandScore: grand,
    actionLevel: level,
    band,
    message,
  };
}

/** Internal consistency self-check (run in dev). Returns true if tables load. */
export function rulaSelfCheck(): boolean {
  // Neutral posture with no load should be acceptable (grand ≤ 2).
  const neutral: ErgoAngles = {
    view: 'side',
    neckFlexion: 5,
    neckSideBend: 0,
    neckTwist: null,
    trunkFlexion: 2,
    trunkSideBend: 0,
    trunkTwist: null,
    upperArmElevation: 10,
    shoulderAbduction: 0,
    shoulderRaised: false,
    lowerArmAngle: 80,
    wristAngle: 2,
    kneeAngle: 0,
    legsSupported: true,
    confidence: 1,
  };
  const m = {
    loadKg: 0,
    loadStatic: false,
    shockOrRapid: false,
    coupling: 'good',
    actionsPerMinute: 1,
    durationHoursPerDay: 2,
    trunkTwisted: false,
    neckTwisted: false,
    horizontalCm: 25,
    verticalCm: 75,
    travelCm: 25,
    asymmetryDeg: 0,
    liftsPerMinute: 1,
  } as ErgoManualInputs;
  const r = computeRula(neutral, m);
  return r.grandScore >= 1 && r.grandScore <= 3;
}
