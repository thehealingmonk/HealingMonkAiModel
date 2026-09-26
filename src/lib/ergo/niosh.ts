/**
 * NIOSH Revised Lifting Equation (Waters et al., 1994).
 *
 *   RWL = LC × HM × VM × DM × AM × FM × CM
 *   Lifting Index (LI) = Load / RWL
 *
 * LC = 23 kg load constant. Multipliers are the standard formulae; the Frequency
 * Multiplier uses the published FM table. Metric (cm / kg) units throughout.
 * Only meaningful for lifting / manual-material-handling tasks — these need the
 * manual origin/destination/frequency inputs the camera cannot supply.
 */

import { ErgoManualInputs, NioshResult, RiskBand } from './ergoTypes';

const LC = 23;

// Frequency Multiplier table.
// Keyed by lifts/min → [duration ≤1h, ≤2h, ≤8h] each as [V<75cm, V≥75cm].
const FM_TABLE: { f: number; v: [number, number][] }[] = [
  { f: 0.2, v: [[1.0, 1.0], [0.95, 0.95], [0.85, 0.85]] },
  { f: 0.5, v: [[0.97, 0.97], [0.92, 0.92], [0.81, 0.81]] },
  { f: 1, v: [[0.94, 0.94], [0.88, 0.88], [0.75, 0.75]] },
  { f: 2, v: [[0.91, 0.91], [0.84, 0.84], [0.65, 0.65]] },
  { f: 3, v: [[0.88, 0.88], [0.79, 0.79], [0.55, 0.55]] },
  { f: 4, v: [[0.84, 0.84], [0.72, 0.72], [0.45, 0.45]] },
  { f: 5, v: [[0.8, 0.8], [0.6, 0.6], [0.35, 0.35]] },
  { f: 6, v: [[0.75, 0.75], [0.5, 0.5], [0.27, 0.27]] },
  { f: 7, v: [[0.7, 0.7], [0.42, 0.42], [0.22, 0.22]] },
  { f: 8, v: [[0.6, 0.6], [0.35, 0.35], [0.18, 0.18]] },
  { f: 9, v: [[0.52, 0.52], [0.3, 0.3], [0.0, 0.15]] },
  { f: 10, v: [[0.45, 0.45], [0.26, 0.26], [0.0, 0.13]] },
  { f: 11, v: [[0.41, 0.41], [0.0, 0.23], [0.0, 0.0]] },
  { f: 12, v: [[0.37, 0.37], [0.0, 0.21], [0.0, 0.0]] },
  { f: 13, v: [[0.0, 0.34], [0.0, 0.0], [0.0, 0.0]] },
  { f: 14, v: [[0.0, 0.31], [0.0, 0.0], [0.0, 0.0]] },
  { f: 15, v: [[0.0, 0.28], [0.0, 0.0], [0.0, 0.0]] },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function horizontalMultiplier(hCm: number): number {
  if (hCm <= 25) return 1.0;
  if (hCm > 63) return 0;
  return 25 / hCm;
}

function verticalMultiplier(vCm: number): number {
  const v = clamp(vCm, 0, 175);
  return clamp(1 - 0.003 * Math.abs(v - 75), 0, 1);
}

function distanceMultiplier(dCm: number): number {
  if (dCm < 25) return 1.0;
  if (dCm > 175) return 0;
  return 0.82 + 4.5 / dCm;
}

function asymmetryMultiplier(aDeg: number): number {
  if (aDeg > 135) return 0;
  return clamp(1 - 0.0032 * aDeg, 0, 1);
}

function frequencyMultiplier(liftsPerMin: number, hours: number, vCm: number): number {
  const durIdx = hours <= 1 ? 0 : hours <= 2 ? 1 : 2;
  const vIdx = vCm >= 75 ? 1 : 0;
  const f = clamp(liftsPerMin, 0.2, 15);
  // Find the first table row whose frequency is >= f (round up to the standard row).
  let row = FM_TABLE[FM_TABLE.length - 1];
  for (const r of FM_TABLE) {
    if (f <= r.f) {
      row = r;
      break;
    }
  }
  return row.v[durIdx][vIdx];
}

function couplingMultiplier(coupling: ErgoManualInputs['coupling'], vCm: number): number {
  const c = coupling === 'unacceptable' ? 'poor' : coupling;
  const high = vCm >= 75;
  if (c === 'good') return 1.0;
  if (c === 'fair') return high ? 1.0 : 0.95;
  return 0.9; // poor
}

function bandFor(li: number, loadKg: number): { band: RiskBand; message: string } {
  if (loadKg <= 0) return { band: 'negligible', message: 'No load entered — lifting risk not applicable.' };
  if (li <= 1) return { band: 'low', message: 'Lifting Index ≤ 1 — acceptable for most healthy workers.' };
  if (li <= 2) return { band: 'medium', message: 'Lifting Index 1–2 — some workers at increased risk; redesign advised.' };
  if (li <= 3) return { band: 'high', message: 'Lifting Index 2–3 — many workers at high risk; redesign the lift.' };
  return { band: 'very-high', message: 'Lifting Index > 3 — unacceptable; redesign immediately.' };
}

export function computeNiosh(manual: ErgoManualInputs): NioshResult {
  const HM = horizontalMultiplier(manual.horizontalCm);
  const VM = verticalMultiplier(manual.verticalCm);
  const DM = distanceMultiplier(manual.travelCm);
  const AM = asymmetryMultiplier(manual.asymmetryDeg);
  const FM = frequencyMultiplier(manual.liftsPerMinute, manual.durationHoursPerDay, manual.verticalCm);
  const CM = couplingMultiplier(manual.coupling, manual.verticalCm);

  const rwl = LC * HM * VM * DM * AM * FM * CM;
  const li = rwl > 0 ? manual.loadKg / rwl : Infinity;
  const liftingIndex = Number.isFinite(li) ? Number(li.toFixed(2)) : 99;
  const { band, message } = bandFor(liftingIndex, manual.loadKg);

  return {
    method: 'NIOSH',
    rwlKg: Number(rwl.toFixed(1)),
    liftingIndex,
    band,
    message,
    multipliers: {
      HM: Number(HM.toFixed(2)),
      VM: Number(VM.toFixed(2)),
      DM: Number(DM.toFixed(2)),
      AM: Number(AM.toFixed(2)),
      FM: Number(FM.toFixed(2)),
      CM: Number(CM.toFixed(2)),
    },
  };
}

export function nioshSelfCheck(): boolean {
  // A textbook ideal lift (H=25, V=75, D=25, A=0, 1 lift/min, ≤1h, good grip)
  // gives RWL close to the 23 kg load constant × ~0.94 FM ≈ 21.6 kg.
  const m = {
    loadKg: 10,
    loadStatic: false,
    shockOrRapid: false,
    coupling: 'good',
    actionsPerMinute: 1,
    durationHoursPerDay: 1,
    trunkTwisted: false,
    neckTwisted: false,
    horizontalCm: 25,
    verticalCm: 75,
    travelCm: 25,
    asymmetryDeg: 0,
    liftsPerMinute: 1,
  } as ErgoManualInputs;
  const r = computeNiosh(m);
  return r.rwlKg > 20 && r.rwlKg < 23 && r.liftingIndex < 1;
}
