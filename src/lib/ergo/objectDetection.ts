/**
 * ErgoAI object detection — the "non-living" half of the workplace scan.
 *
 * Mirrors the lazy-load / GPU-fallback pattern of `@/lib/poseDetection` so the
 * multi-MB MediaPipe runtime is only downloaded when the workstation scan
 * actually runs. We reuse the SAME `@mediapipe/tasks-vision` package that already
 * powers pose detection — no new dependency — but load its EfficientDet object
 * detector alongside the pose landmarker.
 *
 * The detector is COCO-trained, so it reliably finds office objects (person,
 * chair, tv→monitor, laptop, keyboard, mouse, dining table→desk). Industrial
 * objects are not in COCO and simply won't be returned — the relationship engine
 * then reports "not confidently detected" rather than inventing anything.
 */

import type { ObjectDetector as ObjectDetectorInstance } from '@mediapipe/tasks-vision';
import { DetectedObject } from './ergoTypes';
import { COCO_TO_ERGO } from './ergoKnowledge';

let objectDetector: ObjectDetectorInstance | null = null;

// EfficientDet-Lite0: small + fast, good enough for real-time workstation scans
// on a laptop. Pinned float16 build from the official MediaPipe model bucket.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

export async function initializeObjectDetector() {
  if (objectDetector) return objectDetector;

  const { ObjectDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');

  // Same pinned WASM build as the pose landmarker (see poseDetection.ts) so both
  // models run against a runtime that matches the bundled JS API.
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );

  const create = (delegate: 'GPU' | 'CPU') =>
    ObjectDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      // Keep only reasonably confident boxes; the relationship engine attaches
      // its own confidence on top. maxResults caps clutter on the overlay.
      scoreThreshold: 0.35,
      maxResults: 10,
    });

  try {
    objectDetector = await create('GPU');
  } catch (err) {
    console.warn('GPU object-detector delegate unavailable, falling back to CPU.', err);
    objectDetector = await create('CPU');
  }

  return objectDetector;
}

// VIDEO mode needs strictly increasing timestamps. This is a SEPARATE counter
// from the pose one so the two detectors don't fight over a shared clock.
let lastTimestamp = 0;

/**
 * Detect workplace objects in the current video frame. Returns normalised boxes
 * (0–1 relative to the frame) so overlay drawing and the relationship maths are
 * resolution-independent. Objects the detector emits but we don't map are kept
 * as `unknown` rather than dropped, so the UI can still show "object detected".
 */
export function detectObjects(video: HTMLVideoElement): DetectedObject[] {
  if (!objectDetector) return [];
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return [];

  try {
    lastTimestamp = Math.max(lastTimestamp + 1, performance.now());
    const result = objectDetector.detectForVideo(video, lastTimestamp);
    const out: DetectedObject[] = [];

    for (const det of result.detections ?? []) {
      const top = det.categories?.[0];
      if (!top) continue;
      const raw = (top.categoryName ?? '').toLowerCase();
      const mapped = COCO_TO_ERGO[raw];
      const box = det.boundingBox;
      if (!box) continue;

      out.push({
        type: mapped?.type ?? 'unknown',
        label: mapped?.label ?? (raw ? raw.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Object'),
        rawLabel: raw,
        box: {
          x: box.originX / w,
          y: box.originY / h,
          w: box.width / w,
          h: box.height / h,
        },
        score: top.score ?? 0,
      });
    }

    return out;
  } catch (error) {
    console.error('Object detection error:', error);
    return [];
  }
}
