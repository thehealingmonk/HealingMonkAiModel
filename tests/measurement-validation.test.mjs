// Measurement validation + cross-module consistency suite.
//
// Covers the shared measurement layer used by BOTH AI modules (clinical posture
// scan and ErgoAI height/width): multi-frame aggregation, cross-source
// comparison (no silent averaging), body-proportion plausibility, frame-quality
// checks, and agreement between the two modules on the same input.
//
// Ground truth is synthetic (constructed geometry), so these tests verify the
// MATHS and the validation rules — they are not a substitute for a benchmark
// on real, consented images with tape-measured references.
import test from 'node:test';
import assert from 'node:assert/strict';

const { makeRecord } = await import('@/lib/measurement/schema');
const { robustStats, aggregateFrames, compareMeasurements, checkShoulderVsStature } = await import('@/lib/measurement/validation');
const { assessFrameQuality } = await import('@/lib/measurement/imageQuality');
const { CLINICAL_ASSESSMENTS } = await import('@/lib/clinicalKnowledge');
const { extractErgoAngles } = await import('@/lib/ergo/landmarksToAngles');
const { toIsotropic } = await import('@/lib/poseDetection');
const { distanceFromPerson, focalPx } = await import('@/lib/ergo/liveMeasure');

const rad = (d) => (d * Math.PI) / 180;

// Deterministic PRNG + Gaussian so the noise simulation is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function gauss(r) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ---------------------------------------------------------------------------
//  Schema
// ---------------------------------------------------------------------------

test('makeRecord: a missing / non-finite value is rejected, never kept as a number', () => {
  const r = makeRecord({ name: 'Height', value: NaN, unit: 'cm', confidence: null, uncertainty: null, source: 'ergo-photo', calibration: 'calibrated' });
  assert.equal(r.value, null);
  assert.equal(r.validation, 'rejected');
  assert.ok(r.issues.length > 0);
});

// ---------------------------------------------------------------------------
//  Multi-frame aggregation
// ---------------------------------------------------------------------------

test('robustStats: one wild frame does not move the median', () => {
  const s = robustStats([20, 21, 20, 19, 20, 21, 80]);
  assert.equal(s.median, 20);
  assert.ok(s.spread < 2, `spread ${s.spread}`);
  assert.equal(s.n, 7);
});

test('aggregateFrames: steady frames are stable; moving or missing frames are flagged', () => {
  assert.equal(aggregateFrames([30, 30.5, 29.5, 30, 30.2]).stable, true);
  const moving = aggregateFrames([10, 18, 25, 33, 40, 47]);
  assert.equal(moving.stable, false);
  assert.ok(moving.issues.some((i) => /moving/.test(i)));
  const sparse = aggregateFrames([null, null, 12, null, 12]);
  assert.equal(sparse.stable, false);
  assert.equal(sparse.frames, 2);
});

// ---------------------------------------------------------------------------
//  Cross-source comparison
// ---------------------------------------------------------------------------

const rec = (value, uncertainty, calibration, source = 'ergo-photo') =>
  makeRecord({ name: 'Height', value, unit: 'cm', confidence: null, uncertainty, source, calibration });

test('compareMeasurements: values within combined uncertainty agree', () => {
  const c = compareMeasurements(rec(170, 1, 'user-measured', 'user'), rec(172, 1.5, 'calibrated'));
  assert.equal(c.status, 'valid');
  assert.equal(c.lessReliable, null);
});

test('compareMeasurements: a real disagreement is a mismatch — no averaged value, less reliable source named', () => {
  const typed = rec(170, 1, 'user-measured', 'user');
  const photo = rec(158, 1.5, 'calibrated');
  const c = compareMeasurements(typed, photo);
  assert.equal(c.status, 'mismatch');
  assert.equal(c.difference, 12);
  assert.equal(c.lessReliable, photo);
  assert.ok(!('value' in c), 'comparison must not produce a merged value');
  assert.match(c.message, /choose|Re-measure/);
});

test('compareMeasurements: refuses to compare different units or missing values', () => {
  const deg = makeRecord({ name: 'Height', value: 170, unit: 'deg', confidence: null, uncertainty: 1, source: 'clinical', calibration: 'estimated' });
  assert.equal(compareMeasurements(rec(170, 1, 'calibrated'), deg).status, 'rejected');
  assert.equal(compareMeasurements(rec(170, 1, 'calibrated'), rec(null, 1, 'estimated')).status, 'rejected');
});

test('compareMeasurements: equal calibration → the larger-uncertainty value is the less reliable one', () => {
  const a = rec(160, 6, 'estimated', 'ergo-live');
  const b = rec(180, 2, 'estimated', 'ergo-live');
  assert.equal(compareMeasurements(a, b).lessReliable, a);
});

test('checkShoulderVsStature: flags implausible shoulder width for the height', () => {
  assert.equal(checkShoulderVsStature(38, 165).status, 'valid'); // 0.23
  assert.equal(checkShoulderVsStature(60, 160).status, 'warning'); // 0.375
  assert.equal(checkShoulderVsStature(20, 175).status, 'warning'); // 0.114
  assert.equal(checkShoulderVsStature(60, null).status, 'valid'); // nothing to compare
});

// ---------------------------------------------------------------------------
//  Frame quality
// ---------------------------------------------------------------------------

function image(w, h, fn) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = fn(x, y);
      const p = (y * w + x) * 4;
      px[p] = px[p + 1] = px[p + 2] = v;
      px[p + 3] = 255;
    }
  return px;
}
function boxBlur(px, w, h, r) {
  const out = new Uint8ClampedArray(px.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          s += px[(yy * w + xx) * 4];
          n++;
        }
      const p = (y * w + x) * 4;
      out[p] = out[p + 1] = out[p + 2] = s / n;
      out[p + 3] = 255;
    }
  return out;
}

const W = 192, H = 108;
// Mid-grey scene with 16-px blocks — stands in for a textured, in-focus room.
const sharp = image(W, H, (x, y) => (((x >> 4) + (y >> 4)) % 2 ? 170 : 80));

test('frame quality: a well-lit, in-focus scene passes', () => {
  assert.deepEqual(assessFrameQuality(sharp, W, H).issues, []);
});

test('frame quality: dark and over-exposed frames are flagged', () => {
  assert.ok(assessFrameQuality(image(W, H, (x, y) => (((x >> 3) + (y >> 3)) % 2 ? 30 : 10)), W, H).issues.includes('too-dark'));
  assert.ok(assessFrameQuality(image(W, H, (x, y) => (((x >> 3) + (y >> 3)) % 2 ? 255 : 235)), W, H).issues.includes('too-bright'));
});

test('frame quality: a featureless frame is low-contrast, a defocused one is blurry', () => {
  assert.ok(assessFrameQuality(image(W, H, () => 128), W, H).issues.includes('low-contrast'));
  const blurred = boxBlur(sharp, W, H, 4);
  const q = assessFrameQuality(blurred, W, H);
  assert.ok(q.issues.includes('blurry'), JSON.stringify(q));
  assert.ok(q.sharpness < assessFrameQuality(sharp, W, H).sharpness);
});

// ---------------------------------------------------------------------------
//  Cross-module consistency (clinical vs ErgoAI on the SAME landmarks)
// ---------------------------------------------------------------------------

/** Side-view standing skeleton leaning `leanDeg` forward, in physical units, then normalised to a W×H frame. */
function sideSkeleton(leanDeg, fw, fh) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const Hp = fh; // physical unit = pixels
  const hip = { x: fw / 2, y: Hp * 0.55 };
  const trunk = Hp * 0.25;
  const r = rad(leanDeg);
  const sh = { x: hip.x + Math.sin(r) * trunk, y: hip.y - Math.cos(r) * trunk };
  const ear = { x: sh.x + Math.sin(r) * Hp * 0.08, y: sh.y - Math.cos(r) * Hp * 0.08 };
  const knee = { x: hip.x, y: hip.y + Hp * 0.18 };
  const ankle = { x: hip.x, y: hip.y + Hp * 0.36 };
  const elbow = { x: sh.x, y: sh.y + Hp * 0.12 };
  const wrist = { x: elbow.x, y: elbow.y + Hp * 0.1 };
  const set = (i, p) => (lm[i] = { x: p.x / fw, y: p.y / fh, z: 0, visibility: 0.99 });
  for (const [a, b, p] of [[11, 12, sh], [23, 24, hip], [25, 26, knee], [27, 28, ankle], [13, 14, elbow], [15, 16, wrist], [7, 8, ear]]) {
    set(a, p);
    set(b, p);
  }
  return lm;
}

const sideFull = CLINICAL_ASSESSMENTS.find((a) => a.id === 'full_body_left');

for (const [fw, fh] of [[1280, 720], [720, 1280], [1000, 1000]]) {
  test(`cross-module: clinical trunk lean == ErgoAI trunk flexion (frame ${fw}×${fh})`, () => {
    for (const lean of [0, 5, 12, 25, 40]) {
      const lm = toIsotropic(sideSkeleton(lean, fw, fh), fw / fh);
      const clinical = sideFull.measure(lm).value;
      const ergo = extractErgoAngles(lm, 'side').trunkFlexion;
      assert.ok(Math.abs(clinical - lean) <= 1, `clinical ${clinical} vs truth ${lean}`);
      assert.ok(Math.abs(ergo - lean) <= 1, `ergo ${ergo} vs truth ${lean}`);
      assert.ok(Math.abs(clinical - ergo) <= 1, `modules disagree: ${clinical} vs ${ergo}`);
    }
  });
}

test('cross-module: ErgoAI ignores joints below the shared 0.5 visibility bar', () => {
  const lm = toIsotropic(sideSkeleton(10, 1280, 720), 1280 / 720);
  for (const i of [7, 8]) lm[i] = { ...lm[i], visibility: 0.4 }; // ears half-occluded
  assert.equal(extractErgoAngles(lm, 'side').neckFlexion, null);
});

// ---------------------------------------------------------------------------
//  Height/width module: pinhole distance maths (pixels ↔ cm, aspect handling)
// ---------------------------------------------------------------------------

test('ErgoAI distanceFromPerson: recovers the true camera distance from body proportions', () => {
  const fw = 1280, fh = 720, stature = 170;
  const f = focalPx(fw);
  for (const D of [120, 200, 300]) {
    const px = (cm) => (f * cm) / D; // projected length in pixels
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
    const cx = fw / 2, top = fh * 0.1;
    const sh = (stature * 0.23 * 0.88) / 2;
    const at = (i, x, y) => (lm[i] = { x: x / fw, y: y / fh, z: 0, visibility: 0.99 });
    at(11, cx - px(sh), top);
    at(12, cx + px(sh), top);
    at(13, cx - px(sh), top + px(stature * 0.186));
    at(14, cx + px(sh), top + px(stature * 0.186));
    at(15, cx - px(sh), top + px(stature * (0.186 + 0.146)));
    at(16, cx + px(sh), top + px(stature * (0.186 + 0.146)));
    // Eyes 6.3 cm apart, hips/legs left out of frame (not visible).
    at(2, cx - px(3.15), top - px(20));
    at(5, cx + px(3.15), top - px(20));
    for (const i of [23, 24, 25, 26, 27, 28]) lm[i] = { ...lm[i], visibility: 0.1 };
    const est = distanceFromPerson(lm, fw, fh, stature);
    assert.ok(Math.abs(est - D) / D < 0.02, `D=${D} est=${est}`);
  }
});

// ---------------------------------------------------------------------------
//  Repeatability: multi-frame capture vs single frame under landmark noise
// ---------------------------------------------------------------------------

test('repeatability: 15-frame median capture beats a single frame under landmark jitter', () => {
  const r = rng(42);
  const fw = 1280, fh = 720, truth = 12;
  const sigma = 0.004; // ≈ 3–5 px jitter on a 720p frame, typical of live MediaPipe tracking
  const noisy = () =>
    toIsotropic(
      sideSkeleton(truth, fw, fh).map((p) => ({ ...p, x: p.x + gauss(r) * sigma, y: p.y + gauss(r) * sigma })),
      fw / fh
    );
  const trials = 300;
  let singleSq = 0, multiSq = 0, singleWorst = 0, multiWorst = 0;
  for (let t = 0; t < trials; t++) {
    const single = sideFull.measure(noisy()).value;
    const frames = Array.from({ length: 15 }, () => sideFull.measure(noisy()).value);
    const multi = robustStats(frames).median;
    singleSq += (single - truth) ** 2;
    multiSq += (multi - truth) ** 2;
    singleWorst = Math.max(singleWorst, Math.abs(single - truth));
    multiWorst = Math.max(multiWorst, Math.abs(multi - truth));
  }
  const singleRmse = Math.sqrt(singleSq / trials);
  const multiRmse = Math.sqrt(multiSq / trials);
  console.log(
    `[sim] trunk-lean RMSE single-frame ${singleRmse.toFixed(2)}° (worst ${singleWorst}°) vs 15-frame median ${multiRmse.toFixed(2)}° (worst ${multiWorst}°)`
  );
  assert.ok(multiRmse < singleRmse * 0.75, `${multiRmse} vs ${singleRmse}`);
  assert.ok(multiWorst <= singleWorst);
});
