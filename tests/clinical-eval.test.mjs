// Evaluation suite for the posture-measurement "AI" (MediaPipe landmarks →
// clinical angles → severity). Ground truth comes from synthetic skeletons in
// tests/eval/clinical-measurement-cases.json, so scoring is deterministic and
// independent of the system under test (no model grades itself).
//
// Acceptance thresholds (healthcare risk — a wrong severity is shown to patients):
//   • value within ±tolerance°           : 100 % of measurable cases
//   • severity band matches              : 100 %
//   • refuses to measure when landmarks
//     are not confidently visible        : 100 % (critical — never invent a number)
//   • every patient-facing report surface carries the "not a diagnosis" notice
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { CLINICAL_ASSESSMENTS } = await import('@/lib/clinicalKnowledge');
const { toIsotropic } = await import('@/lib/poseDetection');

const dataset = JSON.parse(readFileSync(new URL('./eval/clinical-measurement-cases.json', import.meta.url), 'utf8'));
const TOL = dataset.tolerance;
const rad = (d) => (d * Math.PI) / 180;

/** A plausible front-facing standing skeleton in PHYSICAL (isotropic) units. */
function baseSkeleton() {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const set = (i, x, y) => { lm[i] = { x, y, z: 0, visibility: 0.99 }; };
  set(0, 0.5, 0.12); set(7, 0.46, 0.13); set(8, 0.54, 0.13);
  set(11, 0.4, 0.25); set(12, 0.6, 0.25); set(13, 0.37, 0.38); set(14, 0.63, 0.38);
  set(15, 0.36, 0.5); set(16, 0.64, 0.5);
  set(23, 0.44, 0.55); set(24, 0.56, 0.55); set(25, 0.44, 0.72); set(26, 0.56, 0.72);
  set(27, 0.44, 0.9); set(28, 0.56, 0.9); set(31, 0.43, 0.94); set(32, 0.57, 0.94);
  return lm;
}

const generators = {
  // Line a→b tilted `deg` from horizontal.
  tilt(lm, c) {
    const [a, b] = c.pair;
    const len = 0.2;
    lm[b] = { ...lm[b], x: lm[a].x + len * Math.cos(rad(c.deg)), y: lm[a].y - len * Math.sin(rad(c.deg)) };
  },
  // Craniovertebral angle: right shoulder→right ear line `deg` above horizontal.
  cva(lm, c) {
    const len = 0.12;
    lm[8] = { ...lm[8], x: lm[12].x + len * Math.cos(rad(c.deg)), y: lm[12].y - len * Math.sin(rad(c.deg)) };
  },
  // Joint angle at the middle landmark: first arm points down from the vertex,
  // the second is rotated by `deg` from it.
  joint(lm, c) {
    const [a, b, d] = c.joint;
    const len = 0.17;
    lm[a] = { ...lm[a], x: lm[b].x, y: lm[b].y + len };
    lm[d] = { ...lm[d], x: lm[b].x + len * Math.sin(rad(c.deg)), y: lm[b].y + len * Math.cos(rad(c.deg)) };
  },
  // Right knee bent `deg` off a straight line (left leg stays straight).
  knee_dev(lm, c) {
    const len = 0.17;
    const theta = rad(180 - c.deg); // hip-knee-ankle angle
    lm[24] = { ...lm[24], x: lm[26].x, y: lm[26].y - len };
    lm[28] = { ...lm[28], x: lm[26].x + len * Math.sin(theta), y: lm[26].y - len * Math.cos(theta) };
  },
};

/** Physical skeleton → landmarks normalised to a frame of the given aspect. */
const toNormalised = (lm, aspect) => lm.map((p) => ({ ...p, x: p.x / aspect }));

function runCase(c) {
  const assessment = CLINICAL_ASSESSMENTS.find((a) => a.id === c.assessment);
  assert.ok(assessment, `unknown assessment ${c.assessment}`);
  const physical = baseSkeleton();
  generators[c.gen](physical, c);
  for (const i of c.hide ?? []) physical[i] = { ...physical[i], visibility: 0.1 };
  const normalised = toNormalised(physical, c.aspect);
  return assessment.measure(toIsotropic(normalised, c.aspect));
}

const results = [];

for (const c of dataset.cases) {
  test(`EVAL ${c.id} ${c.assessment} (${c.gen} ${c.deg}°, aspect ${c.aspect}${c.hide ? ', occluded' : ''})`, () => {
    const out = runCase(c);
    const valueOk = c.expect.value === null ? out.value === null : out.value !== null && Math.abs(out.value - c.expect.value) <= TOL;
    const severityOk = out.severity === c.expect.severity;
    results.push({ id: c.id, refusal: c.expect.value === null, valueOk, severityOk });
    assert.ok(valueOk, `value ${out.value} vs expected ${c.expect.value} ±${TOL}`);
    assert.equal(out.severity, c.expect.severity);
  });
}

test('EVAL negative control: skipping aspect correction measurably skews angles', () => {
  // Documents WHY toIsotropic is mandatory: the same 6° shoulder tilt read from
  // raw 16:9 normalised coordinates is under-reported (and changes band).
  const a = CLINICAL_ASSESSMENTS.find((x) => x.id === 'shoulder_level');
  const physical = baseSkeleton();
  generators.tilt(physical, { pair: [11, 12], deg: 6 });
  const raw = a.measure(toNormalised(physical, 16 / 9));
  assert.ok(Math.abs(raw.value - 6) >= 2, `uncorrected value ${raw.value}`);
});

test('EVAL safety: every patient-facing report states it is not a diagnosis', () => {
  const surfaces = {
    'src/features/assessment/ClinicalReport.tsx': /not a medical diagnosis/i,
    'src/lib/reportPdf.ts': /not a medical diagnosis/i,
    'src/features/marketing/About.tsx': /must not be treated as a clinical diagnosis/i,
  };
  for (const [file, re] of Object.entries(surfaces)) {
    const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(src, re, file);
  }
});

test('EVAL summary meets acceptance thresholds', () => {
  const total = results.length;
  const measurable = results.filter((r) => !r.refusal);
  const refusals = results.filter((r) => r.refusal);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 100);
  const summary = {
    cases: total,
    valueAccuracy: pct(measurable.filter((r) => r.valueOk).length, measurable.length),
    severityAgreement: pct(results.filter((r) => r.severityOk).length, total),
    refusalCorrect: pct(refusals.filter((r) => r.valueOk).length, refusals.length),
  };
  console.log('clinical-eval summary', JSON.stringify(summary));
  assert.equal(total, dataset.cases.length, 'every case ran');
  assert.equal(summary.valueAccuracy, 100);
  assert.equal(summary.severityAgreement, 100);
  assert.equal(summary.refusalCorrect, 100);
});
