// Workstation (human + desk/chair) assessment engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessErgonomics } from '@/lib/ergo/ergoEngine';
import { defaultManualInputs } from '@/lib/ergo/ergoKnowledge';

const neutral = {
  view: 'side', neckFlexion: 5, neckSideBend: null, neckTwist: null, trunkFlexion: 3, trunkSideBend: null,
  trunkTwist: null, upperArmElevation: 15, shoulderAbduction: null, shoulderRaised: false, lowerArmAngle: 80,
  wristAngle: 5, kneeAngle: 90, legsSupported: true, confidence: 0.95,
};

test('requires at least one captured pose (UI now catches this instead of a dead click)', () => {
  assert.throws(() => assessErgonomics('office', 'computer', null, null, defaultManualInputs));
});

test('neutral seated computer posture is not flagged high risk', () => {
  const r = assessErgonomics('office', 'computer', neutral, null, defaultManualInputs);
  assert.ok(['negligible', 'low', 'medium'].includes(r.overall), r.overall);
  assert.ok(r.overallScore >= 0 && r.overallScore <= 100);
  assert.ok(r.recommendations.length > 0);
});

test('slumped forward posture raises risk and yields concrete recommendations', () => {
  const slumped = { ...neutral, neckFlexion: 35, trunkFlexion: 35, upperArmElevation: 60 };
  const good = assessErgonomics('office', 'computer', neutral, null, defaultManualInputs);
  const bad = assessErgonomics('office', 'computer', slumped, null, defaultManualInputs);
  assert.ok(bad.overallScore >= good.overallScore);
  assert.ok(bad.primaryFactors.some((f) => /trunk flexion/i.test(f)));
  assert.ok(bad.recommendations.some((r) => r.priority === 1));
});
