// Furniture ↔ body fit, anthropometry and photo-measurement maths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyFromStature, standingPersonPoints } from '@/lib/ergo/anthropometry';
import { idealRanges, fitChecks, predictPosture, buildFitReport } from '@/lib/ergo/furnitureFit';
import { scaleFromReference, measureCm, boxDimsCm } from '@/lib/ergo/photoMeasure';

const empty = { deskHeightCm: null, chairSeatHeightCm: null, monitorDistanceCm: null, footrestPresent: null };
const person = (statureCm) => ({
  statureCm, statureMode: 'user-measured', shoulderWidthCm: null, shoulderMode: 'unknown', population: 'in-adult',
});

test('body dims scale with stature and match published 50th-percentile values', () => {
  const b = bodyFromStature(174, 'male');
  // Pheasant 50th %ile British male: popliteal 44 cm, sitting elbow 24.5 cm, sitting eye 79 cm.
  assert.ok(Math.abs(b.poplitealHeightCm - 44) < 1, `popliteal ${b.poplitealHeightCm}`);
  assert.ok(Math.abs(b.sittingElbowHeightCm - 24.5) < 1);
  assert.ok(Math.abs(b.sittingEyeHeightCm - 79) < 1);
});

test('ideal seat height for a 165 cm person is in the usual 38–45 cm band', () => {
  const r = idealRanges(bodyFromStature(165)).seatHeight;
  assert.ok(r.min > 36 && r.max < 47 && r.ideal > r.min && r.ideal < r.max, JSON.stringify(r));
});

test('a 52 cm seat is too high for a 152 cm woman but a 42 cm seat fits', () => {
  const b = bodyFromStature(152, 'female');
  const high = fitChecks(b, { ...empty, chairSeatHeightCm: 52 })[0];
  assert.equal(high.verdict, 'too-high');
  assert.ok(['medium', 'high'].includes(high.band));
  const ok = fitChecks(bodyFromStature(165, 'male'), { ...empty, chairSeatHeightCm: 42 })[0];
  assert.equal(ok.verdict, 'fits');
});

test('footrest turns a too-high seat into a low-risk finding', () => {
  const b = bodyFromStature(152, 'female');
  const c = fitChecks(b, { ...empty, chairSeatHeightCm: 52, footrestPresent: true })[0];
  assert.equal(c.band, 'low');
});

test('66 cm desk + 43 cm seat suits the average Indian adult; a 76 cm desk does not', () => {
  const tall = buildFitReport(person(null), { ...empty, chairSeatHeightCm: 43, deskHeightCm: 76 });
  assert.equal(tall.average.checks.find((c) => c.key === 'deskHeightCm').verdict, 'too-high');
  const rep = buildFitReport(person(null), { ...empty, chairSeatHeightCm: 43, deskHeightCm: 66 });
  const desk = rep.average.checks.find((c) => c.key === 'deskHeightCm');
  assert.equal(desk.verdict, 'fits', JSON.stringify(desk));
  assert.equal(rep.person, null);
});

test('desk far above the elbow raises predicted RULA vs a well-fitted desk', () => {
  const b = bodyFromStature(160);
  const good = predictPosture(b, { ...empty, chairSeatHeightCm: 41, deskHeightCm: 63 });
  const bad = predictPosture(b, { ...empty, chairSeatHeightCm: 41, deskHeightCm: 82 });
  assert.equal(good.shoulderRaised, false);
  assert.equal(bad.shoulderRaised, true);
  const rep = buildFitReport(person(160), { ...empty, chairSeatHeightCm: 41, deskHeightCm: 82 });
  const repGood = buildFitReport(person(160), { ...empty, chairSeatHeightCm: 41, deskHeightCm: 63 });
  assert.ok(rep.person.predicted.rula.grandScore > repGood.person.predicted.rula.grandScore);
  assert.equal(rep.person.suitable, false);
  assert.equal(repGood.person.suitable, true);
});

test('low laptop screen predicts neck flexion; very high screen predicts extension', () => {
  const b = bodyFromStature(170);
  const low = predictPosture(b, { ...empty, chairSeatHeightCm: 44, monitorTopHeightCm: 95 });
  const high = predictPosture(b, { ...empty, chairSeatHeightCm: 44, monitorTopHeightCm: 160 });
  assert.ok(low.neckFlexion > 20, `low ${low.neckFlexion}`);
  assert.ok(high.neckFlexion < -5, `high ${high.neckFlexion}`);
});

test('tall person vs average: same chair can fit one and not the other', () => {
  const rep = buildFitReport(
    { ...person(190), population: 'in-female' },
    { ...empty, chairSeatHeightCm: 40, deskHeightCm: 62 }
  );
  assert.equal(rep.average.suitable, true, rep.average.summary);
  assert.equal(rep.person.suitable, false, rep.person.summary);
});

test('photo maths: A4 reference gives correct scale and cm with uncertainty', () => {
  const ppcm = scaleFromReference({ x: 100, y: 500 }, { x: 397, y: 500 }, 29.7); // 297 px → 10 px/cm
  assert.equal(ppcm, 10);
  const m = measureCm({ x: 600, y: 200 }, { x: 600, y: 650 }, ppcm, 297, 4);
  assert.equal(m.cm, 45);
  assert.ok(m.errCm > 0 && m.errCm < 2, `err ${m.errCm}`);
  const dims = boxDimsCm({ x: 0.1, y: 0.2, w: 0.25, h: 0.5 }, 1280, 720, ppcm);
  assert.deepEqual(dims, { heightCm: 36, widthCm: 32 });
});

test('standing person points: head top extrapolated from eyes to the right stature', () => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  // Frame 1000 px tall; eyes at y=100, heels at y=900 → eye→floor 800 px → stature 800/0.936 ≈ 854.7 px.
  lm[2].y = lm[5].y = 0.1;
  lm[29].y = lm[30].y = lm[31].y = lm[32].y = 0.9;
  lm[23].y = lm[24].y = 0.5; lm[25].y = lm[26].y = 0.7; lm[27].y = lm[28].y = 0.88;
  const p = standingPersonPoints(lm, 600, 1000);
  assert.ok(p.standing);
  assert.ok(Math.abs(p.floor.y - p.top.y - 854.7) < 1);
});
