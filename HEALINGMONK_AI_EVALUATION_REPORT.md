# HealingMonk AI — AI Evaluation & Healthcare Safety Report

## What "the AI" is
There is **no language model** in HealingMonk. The pipeline is:

camera frame → **MediaPipe Pose Landmarker** (in the browser; model `pose_landmarker` `.task` + WASM loaded from Google/jsDelivr CDNs, package `@mediapipe/tasks-vision ^0.10.35`) → 33 normalised landmarks → `toIsotropic()` aspect correction → deterministic `measure()` functions in `src/lib/clinicalKnowledge.ts` → angle + severity band → doctor reviews/edits → report.

Consequences for the brief:
- Chat-style evaluation categories (ambiguous questions, citations, prompt injection, Hindi/Hinglish answers, provider outage, multi-turn context) **do not apply** — nothing generates free text.
- No patient data leaves the browser for inference; no third-party AI service receives health data.
- "Accuracy" splits into (a) landmark accuracy of MediaPipe on real people — **not measurable from this repo**, needs labelled captures — and (b) correctness of HealingMonk's own geometry and severity logic — **measured below**.

## Evaluation suite (new, version-controlled)
- Dataset: `tests/eval/clinical-measurement-cases.json` — 32 synthetic skeletons with known ground-truth angles. No real patient data.
- Runner: `tests/clinical-eval.test.mjs` (runs in `npm test`). Ground truth is constructed independently of the code under test; nothing grades itself.

Coverage:

| Assessment | Cases | Includes |
|---|---|---|
| shoulder_level | 7 | all 4 severity bands; 16:9 and 9:16 frames; occluded shoulder |
| pelvic_level | 4 | bands; phone-portrait frame; occluded hip |
| head_tilt | 2 | laptop frame |
| forward_head (CVA) | 6 | all bands; portrait frame; occluded ears |
| knee_alignment | 4 | all bands; laptop frame |
| shoulder_flexion_rom | 5 | all bands; portrait frame; occluded wrists |
| squat_depth | 4 | all bands; laptop frame |
| + negative control | 1 | proves skipping aspect correction skews a 6° tilt by ≥2° |
| + safety text check | 1 | "not a medical diagnosis" present on report screen, PDF, About page |

## Acceptance thresholds and results (run 2026-10-25)

| Metric | Threshold | Result |
|---|---|---|
| Measured angle within ±1° of ground truth | 100 % | **100 %** (27/27 measurable cases) |
| Severity band matches expected | 100 % | **100 %** (32/32) |
| Refuses to measure when landmarks are low-confidence (returns "Not visible", never a guessed number) | 100 % — critical | **100 %** (5/5) |
| Disclaimer present on every patient-facing report surface | required | **pass** |

Thresholds are strict because a wrong band is shown to patients. Refusal failures are counted separately so they cannot be averaged away.

## What these scores do NOT prove
- They do not measure MediaPipe's landmark error on real bodies, clothing, lighting or camera angles.
- They do not validate the clinical thresholds themselves (e.g. CVA < 40° = "severe"). The code cites Physiopedia/APTA/"Clinical Experience" per measure; none has been checked against clinician goniometer readings here.
- 7 of the ~20 clinical measures are covered; side-view composite measures (kyphosis, pelvic tilt, scoliosis, hip abduction, full-body) are not yet in the dataset.

## Healthcare safety review
Intended scope (from `About.tsx`, reports): screening/education aid for physiotherapy; final judgement by a clinician.

| Requirement | Status |
|---|---|
| Output not presented as diagnosis | **Met** — banner on report screen, footer on every PDF page, About page. Now regression-tested. |
| No invented dosages/treatments | **Met** — exercises come from a fixed library + doctor input; nothing generated. |
| Encourage professional evaluation | **Met** in report copy ("Final clinical judgement…", "Your doctor will review…"). |
| Emergency / red-flag guidance | **Not met (SAFE-01, P2)** — the paid guest flow asks people who selected a pain area to perform movements; there is no "stop if pain increases" or "seek urgent care for numbness, loss of bladder/bowel control, chest pain, recent trauma…" notice. Needs clinician-written copy — not added here per instructions not to author clinical content without review. |
| Unsupported reassurance | Partly — a "normal" band label could read as "nothing wrong". Consider wording like "within typical range for this measure". Needs clinical review. |
| Marketing claims | No invented credentials, reviews, or accuracy percentages found in marketing pages. |

## Regression rule
Any confirmed measurement defect must be added as a case to `clinical-measurement-cases.json` before the fix. Run `npm test` on every change to `clinicalKnowledge.ts`, `poseDetection.ts`, thresholds, or capture code.

## Next steps (recommended)
1. Collect ~30 consented captures with clinician goniometer readings → measure real-world error per assessment.
2. Extend the synthetic set to the remaining measures.
3. Clinician sign-off on thresholds and on red-flag copy (SAFE-01).
