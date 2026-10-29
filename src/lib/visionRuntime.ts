// Single shared MediaPipe WASM runtime for every vision model (pose landmarker,
// object detector). Resolving it once means the ~10 MB WASM is fetched and
// compiled a single time even when several models load in parallel.

// Pin the WASM build to the exact installed @mediapipe/tasks-vision version.
// Using `@latest` can pull a WASM runtime newer than the bundled JS API, which
// silently breaks landmark detection on some days — unacceptable for clinic use.
// public/sw.js caches these pinned URLs, so keep the two in sync.
export const VISION_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

type Fileset = Awaited<
  ReturnType<typeof import('@mediapipe/tasks-vision').FilesetResolver.forVisionTasks>
>;

let fileset: Promise<Fileset> | null = null;

export function loadVisionFileset(): Promise<Fileset> {
  if (!fileset) {
    // Load the multi-MB MediaPipe runtime ON DEMAND (dynamic import) so it is
    // code-split into its own chunk and only downloaded when the camera is used.
    fileset = import('@mediapipe/tasks-vision')
      .then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(VISION_WASM_URL))
      .catch((err) => {
        // Let a later call retry (e.g. after the network comes back).
        fileset = null;
        throw err;
      });
  }
  return fileset;
}
