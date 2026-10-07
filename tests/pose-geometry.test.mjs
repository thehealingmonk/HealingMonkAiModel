// Human-body alignment geometry: angles must describe the REAL image, so the
// same posture scores the same on any camera / orientation / resolution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toIsotropic, frameAspect, calculateAngle2D } from '@/lib/poseDetection';
import { extractErgoAngles } from '@/lib/ergo/landmarksToAngles';
import { getAssessment } from '@/lib/clinicalKnowledge';
import { computeClinicalPlumbLine } from '@/lib/plumbLine';

const blank = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));

/**
 * Build a side-view body in PIXEL space with the trunk leaning `leanDeg`
 * forward, then express it as MediaPipe-style normalized landmarks for a
 * W×H frame (x / W, y / H).
 */
function sideBody(W, H, leanDeg) {
  const lm = blank();
  const hip = { x: W * 0.5, y: H * 0.6 };
  const trunkLen = H * 0.25;
  const r = (leanDeg * Math.PI) / 180;
  const shoulder = { x: hip.x + Math.sin(r) * trunkLen, y: hip.y - Math.cos(r) * trunkLen };
  const ear = { x: shoulder.x + Math.sin(r) * H * 0.08, y: shoulder.y - Math.cos(r) * H * 0.08 };
  const knee = { x: hip.x, y: hip.y + H * 0.18 };
  const ankle = { x: hip.x, y: hip.y + H * 0.36 };
  const elbow = { x: shoulder.x, y: shoulder.y + H * 0.12 };
  const wrist = { x: elbow.x + H * 0.1, y: elbow.y };
  const set = (i, p) => (lm[i] = { x: p.x / W, y: p.y / H, z: 0, visibility: 0.99 });
  for (const [l, rgt, p] of [[11, 12, shoulder], [23, 24, hip], [25, 26, knee], [27, 28, ankle], [13, 14, elbow], [15, 16, wrist], [7, 8, ear]]) {
    set(l, p);
    set(rgt, p);
  }
  // Right side less visible so the left chain drives the measurement.
  for (const i of [12, 14, 16, 24, 26, 28, 8]) lm[i].visibility = 0.5;
  return lm;
}

test('frameAspect: width/height of a playing video, 1 when unknown', () => {
  assert.equal(frameAspect({ videoWidth: 1920, videoHeight: 1080 }), 1920 / 1080);
  assert.equal(frameAspect({ videoWidth: 0, videoHeight: 0 }), 1);
  assert.equal(frameAspect(null), 1);
});

test('toIsotropic: scales only x, never mutates input, ignores bad aspect', () => {
  const lm = [{ x: 0.5, y: 0.25, z: 0, visibility: 1 }];
  const out = toIsotropic(lm, 2);
  assert.deepEqual(out[0], { x: 1, y: 0.25, z: 0, visibility: 1 });
  assert.equal(lm[0].x, 0.5);
  assert.equal(toIsotropic(lm, 0), lm);
  assert.equal(toIsotropic(lm, NaN), lm);
});

test('ergo trunk flexion is device-independent after aspect correction', () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920], [1280, 720], [640, 480], [1000, 1000]]) {
    const lm = sideBody(W, H, 20);
    const a = extractErgoAngles(toIsotropic(lm, W / H), 'side');
    assert.ok(Math.abs(a.trunkFlexion - 20) < 0.5, `${W}x${H}: got ${a.trunkFlexion}`);
  }
});

test('regression: uncorrected normalized coords skew angles (the bug being fixed)', () => {
  const landscape = extractErgoAngles(sideBody(1920, 1080, 20), 'side').trunkFlexion;
  const portrait = extractErgoAngles(sideBody(1080, 1920, 20), 'side').trunkFlexion;
  assert.ok(landscape < 15, `landscape raw ${landscape}`);
  assert.ok(portrait > 28, `portrait raw ${portrait}`);
});

test('clinical side alignment measure reports the true lean on any frame', () => {
  const side = getAssessment('full_body_left');
  assert.ok(side, 'full_body_left assessment exists');
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    const r = side.measure(toIsotropic(sideBody(W, H, 8), W / H));
    assert.ok(Math.abs(r.value - 8) <= 1, `${W}x${H}: ${r.value}`);
  }
});

test('calculateAngle2D: right angle and straight line', () => {
  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 1, y: 0, z: 0 };
  assert.equal(Math.round(calculateAngle2D(a, b, { x: 1, y: 1, z: 0 })), 90);
  assert.equal(Math.round(calculateAngle2D(a, b, { x: 2, y: 0, z: 0 })), 180);
  assert.equal(calculateAngle2D(a, a, b), 0); // degenerate: no NaN
});

test('plumb line stays in normalized coordinates (overlay-safe) and is aligned for an upright body', () => {
  for (const [W, H] of [[1920, 1080], [1080, 1920]]) {
    const plumb = computeClinicalPlumbLine(sideBody(W, H, 0), 'side', W / H);
    assert.ok(plumb, 'plumb computed');
    assert.ok(plumb.lineX >= 0 && plumb.lineX <= 1, 'lineX normalized');
    assert.ok(plumb.topY >= 0 && plumb.bottomY <= 1 && plumb.topY < plumb.bottomY);
    for (const p of plumb.points) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  }
});
