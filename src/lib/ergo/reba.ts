/**
 * REBA — Rapid Entire Body Assessment (Hignett & McAtamney, 2000).
 *
 * The whole-body method, best for standing industrial / manual tasks (the
 * factory worker in the reference image). Produces a score 1–15 and an action
 * level 0–4. Tables A, B and C below are the published REBA worksheet.
 */

import {
  ErgoAngles,
  ErgoManualInputs,
  RebaResult,
  RiskBand,
  ErgoSegment,
} from './ergoTypes';

// Table A[trunk-1][neck-1][legs-1]  (trunk 1-5, neck 1-3, legs 1-4)
const TABLE_A: number[][][] = [
  [
    [1, 2, 3, 4],
    [1, 2, 3, 4],
    [3, 3, 5, 6],
  ],
  [
    [2, 3, 4, 5],
    [3, 4, 5, 6],
    [4, 5, 6, 7],
  ],
  [
    [2, 4, 5, 6],
    [4, 5, 6, 7],
    [5, 6, 7, 8],
  ],
  [
    [3, 5, 6, 7],
    [5, 6, 7, 8],
    [6, 7, 8, 9],
  ],
  [
    [4, 6, 7, 8],
    [6, 7, 8, 9],
    [7, 8, 9, 9],
  ],
];

// Table B[upperArm-1][lowerArm-1][wrist-1]  (upperArm 1-6, lowerArm 1-2, wrist 1-3)
const TABLE_B: number[][][] = [
  [
    [1, 2, 2],
    [1, 2, 3],
  ],
  [
    [1, 2, 3],
    [2, 3, 4],
  ],
  [
    [3, 4, 5],
    [4, 5, 5],
  ],
  [
    [4, 5, 5],
    [5, 6, 7],
  ],
  [
    [6, 7, 8],
    [7, 8, 8],
  ],
  [
    [7, 8, 8],
    [8, 9, 9],
  ],
];

// Table C[scoreA-1][scoreB-1]  (both 1-12)
const TABLE_C: number[][] = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function trunkScore(a: ErgoAngles, m: ErgoManualInputs): number {
  const deg = a.trunkFlexion ?? 0;
  let s: number;
  if (deg <= 5) s = 1;
  else if (deg <= 20) s = 2;
  else if (deg <= 60) s = 3;
  else s = 4;
  if (m.trunkTwisted || a.trunkTwist || (a.trunkSideBend ?? 0) > 10) s += 1;
  return clamp(s, 1, 5);
}

function neckScore(a: ErgoAngles, m: ErgoManualInputs): number {
  const deg = a.neckFlexion ?? 0;
  let s = deg <= 20 ? 1 : 2;
  if (m.neckTwisted || a.neckTwist || (a.neckSideBend ?? 0) > 10) s += 1;
  return clamp(s, 1, 3);
}

function legsScore(a: ErgoAngles): number {
  let s = a.legsSupported ? 1 : 2;
  const knee = a.kneeAngle ?? 0; // flexion
  if (knee > 60) s += 2;
  else if (knee > 30) s += 1;
  return clamp(s, 1, 4);
}

function upperArmScore(a: ErgoAngles): number {
  const deg = a.upperArmElevation ?? 0;
  let s: number;
  if (deg <= 20) s = 1;
  else if (deg <= 45) s = 2;
  else if (deg <= 90) s = 3;
  else s = 4;
  if (a.shoulderRaised || (a.shoulderAbduction ?? 0) > 45) s += 1;
  return clamp(s, 1, 6);
}

function lowerArmScore(a: ErgoAngles): number {
  const deg = a.lowerArmAngle ?? 80;
  return deg >= 60 && deg <= 100 ? 1 : 2;
}

function wristScore(a: ErgoAngles): number {
  const deg = a.wristAngle ?? 0;
  return deg <= 15 ? 1 : 2;
}

function loadScore(m: ErgoManualInputs): number {
  let s: number;
  if (m.loadKg < 5) s = 0;
  else if (m.loadKg <= 10) s = 1;
  else s = 2;
  if (m.shockOrRapid) s += 1;
  return s;
}

function couplingScore(m: ErgoManualInputs): number {
  return { good: 0, fair: 1, poor: 2, unacceptable: 3 }[m.coupling];
}

/** Activity score: static hold, small-range repetition, or unstable base. */
function activityScore(a: ErgoAngles, m: ErgoManualInputs): number {
  let s = 0;
  if (m.loadStatic || m.durationHoursPerDay >= 4) s += 1; // held static / prolonged
  if (m.actionsPerMinute > 4) s += 1; // repeated small-range actions
  if (!a.legsSupported) s += 1; // unstable base / rapid large changes
  return s;
}

function bandFor(score: number): {
  band: RiskBand;
  level: 0 | 1 | 2 | 3 | 4;
  message: string;
} {
  if (score <= 1) return { band: 'negligible', level: 0, message: 'Negligible risk — no action needed.' };
  if (score <= 3) return { band: 'low', level: 1, message: 'Low risk — change may be needed.' };
  if (score <= 7) return { band: 'medium', level: 2, message: 'Medium risk — further investigation, change soon.' };
  if (score <= 10) return { band: 'high', level: 3, message: 'High risk — investigate and implement change.' };
  return { band: 'very-high', level: 4, message: 'Very high risk — implement change now.' };
}

export function computeReba(angles: ErgoAngles, manual: ErgoManualInputs): RebaResult {
  const trunk = trunkScore(angles, manual);
  const neck = neckScore(angles, manual);
  const legs = legsScore(angles);
  const tableA = TABLE_A[trunk - 1][neck - 1][legs - 1];
  const scoreA = clamp(tableA + loadScore(manual), 1, 12);

  const upper = upperArmScore(angles);
  const lower = lowerArmScore(angles);
  const wrist = wristScore(angles);
  const tableB = TABLE_B[upper - 1][lower - 1][wrist - 1];
  const scoreB = clamp(tableB + couplingScore(manual), 1, 12);

  const tableC = TABLE_C[scoreA - 1][scoreB - 1];
  const grand = clamp(tableC + activityScore(angles, manual), 1, 15);
  const { band, level, message } = bandFor(grand);

  // Per-segment sub-scores, so the overlay can paint the highest-risk segment.
  const segments: { segment: ErgoSegment; score: number }[] = [
    { segment: 'neck', score: neck },
    { segment: 'trunk', score: trunk },
    { segment: 'legs', score: legs },
    { segment: angles.view === 'front' ? 'left-upper-arm' : 'right-upper-arm', score: upper },
    { segment: angles.view === 'front' ? 'left-lower-arm' : 'right-lower-arm', score: lower + wrist },
  ];

  return {
    method: 'REBA',
    scoreA,
    scoreB,
    grandScore: grand,
    actionLevel: level,
    band,
    message,
    segments,
  };
}

export function rebaSelfCheck(): boolean {
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
    wristAngle: 5,
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
  const r = computeReba(neutral, m);
  return r.grandScore >= 1 && r.grandScore <= 3;
}
