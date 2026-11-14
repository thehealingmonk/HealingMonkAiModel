// Scan-time checks: wrong position (front/side/back, standing/sitting/lying)
// and body parts missing from the frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBodyPosition, checkPosition, PositionStabilizer } from '@/lib/positionCheck';
import { detectMissingBodyParts, computeGuidance } from '@/lib/captureGuidance';

const P = (x, y, z = 0, visibility = 0.99) => ({ x, y, z, visibility });
const blank = () => Array.from({ length: 33 }, () => P(0.5, 0.5));

/** Upright standing body. `half` = half shoulder span; `flip` mirrors left/right (back view). */
function standing({ half = 0.1, flip = false, side = null } = {}) {
  const lm = blank();
  const s = flip ? -1 : 1;
  const set = (i, x, y, z = 0, v = 0.99) => (lm[i] = P(x, y, z, v));
  // Facing camera: person's LEFT (odd idx) appears on image RIGHT.
  const near = side === 'left' ? -0.1 : side === 'right' ? 0.1 : 0; // z offset for left side
  const lv = side === 'right' ? 0.6 : 0.99;
  const rv = side === 'left' ? 0.6 : 0.99;
  for (const i of [0, 2, 5, 7, 8]) set(i, 0.5, 0.12);
  set(11, 0.5 + s * half, 0.25, near, lv);
  set(12, 0.5 - s * half, 0.25, -near, rv);
  set(13, 0.5 + s * half, 0.4, near, lv);
  set(14, 0.5 - s * half, 0.4, -near, rv);
  set(15, 0.5 + s * half, 0.52, near, lv);
  set(16, 0.5 - s * half, 0.52, -near, rv);
  set(23, 0.5 + s * half * 0.7, 0.55, near, lv);
  set(24, 0.5 - s * half * 0.7, 0.55, -near, rv);
  set(25, 0.5 + s * half * 0.7, 0.72, near, lv);
  set(26, 0.5 - s * half * 0.7, 0.72, -near, rv);
  set(27, 0.5 + s * half * 0.7, 0.88, near, lv);
  set(28, 0.5 - s * half * 0.7, 0.88, -near, rv);
  for (const i of [29, 31]) set(i, 0.5 + s * half * 0.7, 0.92, near, lv);
  for (const i of [30, 32]) set(i, 0.5 - s * half * 0.7, 0.92, -near, rv);
  return lm;
}

const stable = (lm, key = 'a') => {
  const st = new PositionStabilizer();
  let d;
  for (let i = 0; i < 15; i++) d = st.push(detectBodyPosition(lm), key);
  return d;
};

test('facing the camera is detected as front, standing', () => {
  const d = detectBodyPosition(standing());
  assert.equal(d.facing, 'front');
  assert.equal(d.posture, 'standing');
});

test('back to the camera is detected as back', () => {
  assert.equal(detectBodyPosition(standing({ flip: true })).facing, 'back');
});

test('sideways is detected, including which side is towards the camera', () => {
  assert.equal(detectBodyPosition(standing({ half: 0.02, side: 'left' })).facing, 'side-left');
  assert.equal(detectBodyPosition(standing({ half: 0.02, side: 'right' })).facing, 'side-right');
});

test('side-view assessment while facing front → wrong position with a suggestion', () => {
  const c = checkPosition(stable(standing()), { view: 'side', patientPosition: 'Standing' });
  assert.equal(c.correct, false);
  assert.match(c.problem.en, /facing the camera/);
  assert.match(c.suggestion.en, /sideways/);
});

test('left-side assessment with the right side towards the camera → wrong', () => {
  const c = checkPosition(stable(standing({ half: 0.02, side: 'right' })), {
    view: 'side',
    sideFacing: 'left',
    patientPosition: 'Standing',
  });
  assert.equal(c.correct, false);
  assert.match(c.suggestion.en, /LEFT side/);
});

test('correct position passes', () => {
  assert.equal(checkPosition(stable(standing()), { view: 'front', patientPosition: 'Standing' }).correct, true);
  assert.equal(
    checkPosition(stable(standing({ flip: true })), { view: 'back', patientPosition: 'Standing' }).correct,
    true
  );
});

test('standing when a sitting assessment is selected → wrong posture', () => {
  const c = checkPosition(stable(standing({ half: 0.02, side: 'left' })), { view: 'side', patientPosition: 'Sitting' });
  assert.equal(c.correct, false);
  assert.match(c.problem.en, /standing/);
  assert.match(c.suggestion.en, /^Sit/);
});

test('stabilizer ignores a single noisy frame and resets on a new pose', () => {
  const st = new PositionStabilizer();
  for (let i = 0; i < 14; i++) st.push(detectBodyPosition(standing()), 'a');
  const d = st.push(detectBodyPosition(standing({ flip: true })), 'a');
  assert.equal(d.facing, 'front');
  assert.equal(st.push(detectBodyPosition(standing()), 'b').facing, 'unknown');
});

test('missing legs are reported by name; side view merges left/right', () => {
  const lm = standing();
  for (const i of [25, 26, 27, 28, 29, 30, 31, 32]) lm[i] = P(0.5, 1.2, 0, 0.1);
  const ids = detectMissingBodyParts(lm, 'front').map((p) => p.id);
  assert.ok(ids.includes('left-knee') && ids.includes('right-ankle') && ids.includes('left-foot'));
  assert.ok(!ids.includes('head'));
  const sideIds = detectMissingBodyParts(lm, 'side').map((p) => p.id);
  assert.deepEqual(sideIds.sort(), ['ankle', 'foot', 'knee']);
  assert.equal(detectMissingBodyParts(standing(), 'front').length, 0);
});

test('guidance: wrong position and missing parts produce alerts', () => {
  const wrong = checkPosition(stable(standing()), { view: 'back', patientPosition: 'Standing' });
  assert.equal(computeGuidance(standing(), null, 'back', wrong).status, 'wrong-position');
  const lm = standing();
  for (const i of [27, 28, 29, 30, 31, 32]) lm[i] = P(0.5, 1.2, 0, 0.1);
  const g = computeGuidance(lm, null, 'front', null);
  assert.equal(g.status, 'body-incomplete');
  assert.ok(g.missingParts.length > 0);
});
