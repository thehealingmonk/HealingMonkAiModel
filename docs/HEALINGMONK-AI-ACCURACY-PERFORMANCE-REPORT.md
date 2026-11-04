# HealingMonk AI — Accuracy, Speed & Reliability Report

Date: 2026-11-04
Scope: both on-device AI modules, their shared vision runtime, and the report save API they write to.

> **How to read this report.** Every number below is labelled as either **measured** (I ran it and quote the output), **calculated** (worked out from measured inputs such as file sizes), or **not measured**. No accuracy percentage is claimed for real patients: there is no consented image set with tape-measured reference values in this repository, so a real-world accuracy benchmark could not be run.

---

## 1. Architecture of the two AI systems

Both modules run **entirely in the browser**. No image is sent to a server for inference.

| | AI Module 1: Clinical full-body posture scan | AI Module 2: ErgoAI height / width / body dimensions |
|---|---|---|
| Entry | `PositionSelect` → `ClinicalCapture` → `DoctorReportView` / `ClinicalReport` (admin, doctor, reception, public demo) | `/ergo`: `ErgoSetup` → `ErgoCapture` → `ErgoWorkstationScan` → `ErgoObjectMeasure` (+ `ErgoPhotoMeasure`, `ErgoArMeasure`) → `ErgoReport` |
| Model | MediaPipe Pose Landmarker **full** (float16), 33 landmarks, VIDEO mode, GPU with CPU fallback | Same pose model (shared instance), plus **EfficientDet-Lite0** object detector (COCO) |
| Output | Joint and alignment angles in **degrees** (38 clinical assessments), severity bands, plumb-line and symmetry checks | Joint angles for RULA/REBA, and sizes in **cm**: stature, shoulder width, furniture dimensions, live H×W tags |
| Scale | Not needed (angles have no scale) | Needed. Sources ranked: tape value > photo calibrated with a reference in the same plane > AR (WebXR) > estimate from body proportions or camera FOV |
| Key files | `lib/clinicalKnowledge.ts`, `lib/plumbLine.ts`, `lib/postureVisualizer.ts`, `lib/captureGuidance.ts` | `lib/ergo/landmarksToAngles.ts`, `liveMeasure.ts`, `photoMeasure.ts`, `anthropometry.ts`, `calibration.ts`, `arMeasure.ts`, `furnitureFit.ts` |

Shared infrastructure:
- `lib/visionRuntime.ts`: a single MediaPipe WASM runtime (11.15 MB, version-pinned to 0.10.35).
- `lib/poseDetection.ts`: a single shared pose landmarker with an in-flight promise, so it is never loaded twice. Also contains the One-Euro smoothing and the `toIsotropic` aspect-ratio correction.
- `public/sw.js`: caches the pinned WASM and model URLs cache-first after the first visit.

## 2. Models and libraries

| Asset | Size (measured download) | Used by |
|---|---|---|
| `@mediapipe/tasks-vision` WASM 0.10.35 (`vision_wasm_internal.wasm`) | 11,153,617 B | both |
| `pose_landmarker_full.task` float16 | 9,398,198 B | both |
| `efficientdet_lite0.tflite` float16 | 7,254,339 B | ErgoAI only |

No model was replaced. No new npm dependency was added.

## 3. Audit findings: what was already right

These items were checked and found correct, so they were left unchanged:
- **Aspect-ratio correction.** Angles are computed on isotropic coordinates (`toIsotropic`) in both modules. Without it, a 20° lean reads about 12° on 16:9 and about 33° on 9:16.
- **Pixel-to-cm conversion and uncertainty.** The photo measure needs a reference in the same plane. Tap error is propagated into ± cm (`measureCm`). Uncalibrated values carry an "estimated" label and a "≈" prefix.
- **Never inventing values.** Clinical `measure()` returns `null` when landmarks are not visible, and the existing `clinical-eval` suite enforces this.
- **Model loading.** There is one shared WASM runtime, de-duplicated in-flight loads, GPU→CPU fallback, `requestVideoFrameCallback` pacing, monotonic VIDEO timestamps, and a service-worker model cache.
- **Plausibility.** Stature outside 120–215 cm is already rejected.

## 4. Problems found (root causes)

| # | Problem | Module | Root cause | Impact |
|---|---|---|---|---|
| P1 | Captured value came from **one frame** | Clinical | `handleCapture` measured only `latestLandmarks` | Landmark jitter goes straight into the saved value. Simulated: RMSE 2.21°, worst case 6° (see §10) |
| P2 | No **image-quality** check at capture | Clinical | None existed | Dark, blown-out or blurred frames were measured as if they were fine |
| P3 | No **steadiness or confidence** recorded with a capture | Clinical | `AssessmentCapture` had no reliability field | The report could not tell a solid value from a shaky one |
| P4 | **Silent overwrite**: photo-measured height replaced a typed tape height with no comparison | ErgoAI | `ErgoObjectMeasure.onSave` | A tap or scale error could quietly replace a correct height, and every derived body dimension would follow it |
| P5 | Shoulder width was never checked against height | ErgoAI | No cross-check existed | Implausible values (for example 60 cm on a 160 cm person) were accepted |
| P6 | **Inconsistent landmark-confidence bar.** ErgoAI angles accepted visibility > 0.3; the clinical module uses 0.4–0.5 | ErgoAI | `seen()` threshold in `landmarksToAngles.ts` | Half-occluded joints, whose positions MediaPipe guesses, fed into RULA/REBA |
| P7 | **Slow first open in ErgoAI**: pose and object models downloaded at the same time | ErgoAI | `ErgoCapture` started both loads together | Posture tracking, the part the user is waiting for, had to wait for 7.25 MB of detector bytes |
| P8 | ErgoAI started loading the model only when the camera screen opened | ErgoAI | No preload on `ErgoSetup` (the clinical flow already preloads in `PositionSelect`) | The setup time was wasted |
| P9 | First inference was slow (GPU shader compile) | both | Shaders compiled on the first live frame | Frozen first frame after "Tracking…" |
| P10 | **Duplicate report records** were possible | Clinical report | No idempotency. A remount of the report view (browser back/forward) or a retried POST created a second report and sent a second patient email | Duplicate records in the patient timeline |
| P11 | No performance telemetry | both | None existed | Load and inference times could not be checked in the field |

## 5. Changes implemented

**New shared measurement layer (`src/lib/measurement/`):**
- `schema.ts`: a common `MeasurementRecord` with name, value, unit, confidence, ± uncertainty, source module, calibration status, validation status, issues and timestamp. It includes the ranking `user-measured > calibrated > estimated > unavailable` and plain-language labels.
- `validation.ts`:
  - `robustStats` and `aggregateFrames`: median plus MAD-based spread.
  - `compareMeasurements`: tolerance = 2·√(u₁²+u₂²). On disagreement it returns `mismatch` and names the **less reliable** source. It **never** returns an averaged or merged value and never picks the higher value.
  - `checkShoulderVsStature`: plausibility band of 0.19–0.27 × stature.
- `imageQuality.ts`: brightness, contrast and Laplacian-variance sharpness on a 192 px downscaled frame. It runs only at capture time.
- `perfLog.ts`: privacy-preserving timings and counters (no images, landmarks or personal data), viewable in the browser console with `window.__hmAiPerf.summary()`.

**Clinical module (P1–P3):**
- `ClinicalCapture` keeps the last 1 s of per-frame results for the current pose. At capture it saves the **real frame whose value is closest to the median**, so the value and its severity always come from the same frame and nothing is interpolated.
- Each capture now carries `quality`: frames used, spread, stable yes/no, mean landmark confidence, and issues. Issues include fewer than 5 valid frames, spread above 3°, landmark confidence below 0.6, too dark, over-exposed, low contrast, or blurry.
- Warnings appear in an amber box under the capture and as a dot on the thumbnail. The report shows "⚠ Lower reliability: …" next to the value. The doctor can still capture. Nothing is blocked or hidden.
- The finding is saved with an optional `reliability` sub-document (see §14).

**ErgoAI (P4–P8):**
- If a photo-measured height disagrees with a typed height beyond tolerance, the user sees **"Height mismatch — please choose"** with both values ("Keep typed" or "Use photo"). Nothing is replaced automatically.
- Shoulder width is checked live against height, and a warning is shown when the pair is implausible.
- The ErgoAI landmark bar is raised to **> 0.5** (`ERGO_MIN_VISIBILITY`), the same bar the clinical capture uses.
- The object detector now loads **after** the pose model in `ErgoCapture`. `ErgoWorkstationScan`, which needs both, is unchanged.
- The pose model now preloads on `ErgoSetup`.

**Both modules (P9, P11):** a one-off warm-up inference runs on a blank 256×256 canvas right after the model loads. It bypasses the smoother and uses the shared monotonic timestamp. WASM load, model load, warm-up and per-frame inference are now timed.

**Report API (P10):**
- `POST /api/reports` returns the existing report when the same `shareId` is posted again for the same patient (status 200, `duplicate: true`).
- `DoctorReportView` reuses the already-saved report when it remounts for the same capture set.

## 6. Measurement validation: how mismatches are handled now

| Situation | Behaviour |
|---|---|
| Two sources agree within combined uncertainty | Accepted (`valid`) |
| Two sources disagree | `mismatch`. Both values are shown, the less reliable one is named, and the user decides or re-measures. **No averaging, no auto-pick.** |
| Units differ, or one value is missing | `rejected`: the values are not compared |
| Value outside human-plausible proportions | `warning` shown next to the value |
| Unsteady, low-confidence or poor-image capture | Value kept, warning stored with the finding and shown in the report |
| Required landmarks not visible | `null` and "no value recorded". Never fabricated (existing rule, still enforced by tests) |

**Cross-module consistency.** On the **same landmarks**, the clinical "full body side" trunk lean and ErgoAI trunk flexion agree within 1° of each other and of the ground truth, for 0–40° leans on 16:9, 9:16 and 1:1 frames. This is tested.

## 7. AI initialisation improvements

| Change | Effect |
|---|---|
| Detector deferred until pose is ready (ErgoAI) | **Calculated**, cold cache: bytes needed before posture tracking can start drop from 27.8 MB (WASM 11.15 + pose 9.40 + detector 7.25 sharing bandwidth) to **20.55 MB**, which is **−26 %**. At 10 Mbit/s that is about 22 s → about 16 s. With a warm service-worker cache there is no download, so this makes no difference. |
| Preload on `ErgoSetup` | The download overlaps the time the user spends on the setup screen. Gain depends on how long they stay there. **Not measured.** |
| GPU warm-up | Moves the first-inference shader compile off the first live frame and overlaps it with the camera opening. **Not measured in a browser here.** It is now timed as `pose-warmup`. |

## 8. Before/after loading times

**Not measured.** This environment has no camera and no instrumented browser session. The previous code had no timing instrumentation, so there is no "before" baseline either. Both are now recorded on real devices:

```js
// In the browser console on the capture screen:
window.__hmAiPerf.summary()
// → { events: [{metric:'wasm-load',ms}, {metric:'pose-model-load',ms}, {metric:'pose-warmup',ms}, …],
//     inferenceMs: { samples, p50, p95 }, counters: { 'capture-unstable': n, 'measurement-mismatch': n, … } }
```

Recommended: collect this on 2–3 target devices (a clinic laptop and a mid-range Android phone), cold and warm cache, before and after deploying.

## 9. Before/after inference times

**Not measured.** The per-frame inference code path was not changed (same model, same delegate, same options). Capture now adds one 192 px frame-quality pass, which runs **only when Capture is pressed**. Inference p50/p95 is now logged for field measurement.

## 10. Benchmark results (synthetic only)

There is no real image dataset with reference measurements, so **no real-world accuracy is claimed**. The following synthetic results are **measured** (output of `npm test`):

| Check | Result |
|---|---|
| Clinical vs ErgoAI trunk angle on identical landmarks, 3 aspect ratios × 5 leans | Agree within **≤ 1°**, both within 1° of the truth |
| Pinhole distance from body proportions (`distanceFromPerson`), D = 120/200/300 cm | Error **< 2 %** with exact proportions. This checks the formula and unit maths only. Real people differ from average proportions by about ±3–5 %. |
| Repeatability under simulated landmark jitter (σ = 0.4 % of frame, about 3–5 px at 720p), 300 trials, trunk lean 12° | Single frame: **RMSE 2.21°, worst 6°**. 15-frame median: **RMSE 0.80°, worst 2°** |
| Frame quality on synthetic scenes | Dark, over-exposed, flat and defocused frames are flagged; an in-focus scene passes |

The noise level used in the simulation is an assumption, not a measurement of MediaPipe on your devices.

## 11. Test results (measured)

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | Passed, 0 errors |
| `npm test` | **97 / 97 pass** (80 existing + 17 new in `tests/measurement-validation.test.mjs`) |
| `next build` | Passed |
| Lint | No lint script or ESLint config in the project, so not run |
| Manual browser and camera check of both modules | **Not done** in this environment. Needs a device with a camera (see §15). |

## 12. Remaining limitations

1. **No real-world accuracy benchmark.** MAE, RMSE, MAPE, bias, landmark accuracy and confidence calibration on real people all need a consented dataset with tape-measured or goniometer reference values, kept separate from any tuning data.
2. **Frame-quality thresholds are provisional.** The Laplacian sharpness score depends on the scene (tested: the same blur scores differently on fine and coarse textures). Thresholds are conservative and the checks only warn. Tune them on real clinic frames.
3. **Single-camera cm values remain estimates** unless a same-plane reference, AR, or a typed value is used. The "auto-person" and "distance" live sizes assume a 62° field of view and average body proportions. They are labelled "≈" but can be off by 10 % or more.
4. **Multiple people in frame (clinical).** The pose model is set to `numPoses: 1`, so it cannot report a second person. Raising this would add detector cost to every frame and was not done without on-device measurements. ErgoAI's object detector can see extra people, but this is not yet turned into a warning.
5. **No Web Worker inference.** MediaPipe's GPU delegate in a worker needs OffscreenCanvas/WebGL in workers, which varies by browser. Moving it was judged too risky without device testing.
6. **2D angles.** Out-of-plane rotation (patient not exactly side-on or front-on) still biases angles. The plumb-line and guidance checks reduce this but cannot remove it.
7. The saved clinical value comes from a frame near the median, so the annotated photo (from the shutter frame) can differ from the reported value by up to the recorded spread.

## 13. Files modified

New:
- `src/lib/measurement/schema.ts`
- `src/lib/measurement/validation.ts`
- `src/lib/measurement/imageQuality.ts`
- `src/lib/measurement/perfLog.ts`
- `tests/measurement-validation.test.mjs`
- `docs/HEALINGMONK-AI-ACCURACY-PERFORMANCE-REPORT.md`

Changed:
- `src/features/assessment/ClinicalCapture.tsx`: multi-frame capture, quality checks, warnings
- `src/features/assessment/ClinicalReport.tsx`: reliability note
- `src/lib/clinicalKnowledge.ts`: `CaptureQuality` and `AssessmentCapture.quality`
- `src/lib/reportBuilder.ts` and `src/services/api.ts`: `reliability` on findings
- `src/lib/server/models/Report.ts`: optional `reliability` sub-document
- `src/app/api/reports/route.ts`: idempotent create by `shareId`
- `src/features/doctor/DoctorReportView.tsx`: no duplicate save on remount
- `src/features/ergo/ErgoObjectMeasure.tsx`: height mismatch decision, shoulder plausibility
- `src/features/ergo/ErgoCapture.tsx`: detector loads after pose
- `src/features/ergo/ErgoSetup.tsx`: pose preload
- `src/lib/ergo/landmarksToAngles.ts`: visibility bar 0.3 → 0.5
- `src/lib/poseDetection.ts`, `src/lib/ergo/objectDetection.ts`, `src/lib/visionRuntime.ts`: timing and warm-up

## 14. Database changes

- **One additive, optional field:** `hm_reports.findings[].reliability` = `{ frames, spread, stable, landmarkConfidence, issues[] }`.
- **No migration needed.** Existing documents simply don't have the field, and every reader treats it as optional. Nothing is renamed or removed, and no index changed.
- Idempotency uses the existing `shareId` index on `hm_reports`.

## 15. Production deployment

1. `npm ci && npm run typecheck && npm test && npm run build`.
2. Deploy as usual. No environment-variable changes.
3. The service-worker AI cache name (`hm-ai-models-v1`) is unchanged because no model URL changed.
4. Smoke test on a real device (clinic laptop and an Android phone):
   - Clinical: capture one pose while standing still, then one while moving. The second should show the amber "Check this capture" box. Generate the report, go back, then forward. Only one report should appear in the patient timeline.
   - ErgoAI: type a height (for example 170), then photo-measure a clearly different height. You should see the mismatch prompt.
   - Run `window.__hmAiPerf.summary()` and note the load and inference timings.

---

## Issues that could not be fixed (missing data, hardware or model limits)

| Issue | Blocked by |
|---|---|
| Real-world accuracy figures (MAE/RMSE/MAPE/bias per measurement and condition) | No consented image set with independent reference measurements |
| Tuning blur, lighting and confidence thresholds per device | Same dataset, plus device logs from `__hmAiPerf` |
| Verified before/after load and inference timings | Needs real devices with cameras. Instrumentation is now in place. |
| True metric height/width from a single plain photo without a reference | Physically under-determined: needs a reference, AR depth or a typed value |
| Multi-person rejection in the clinical scan | Needs `numPoses > 1`, whose per-frame cost must be measured on target phones first |
| Off-main-thread inference | Browser support for the GPU delegate in workers varies; needs device testing |
| Depth-corrected 3D joint angles | MediaPipe world-landmark depth is not reliable enough for clinical angles from one RGB camera |
