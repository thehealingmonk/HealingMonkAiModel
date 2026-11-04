/**
 * Frame quality check for both AI modules — run on a small downscaled copy of
 * the camera frame at capture time (a few ms), never on every live frame.
 *
 * Flags conditions under which landmark positions are known to degrade: too
 * dark, blown out, low contrast, or motion/focus blur. These are ADVISORY
 * warnings attached to the capture; thresholds are deliberately conservative
 * because they have not yet been tuned on a labelled clinic dataset (see
 * docs/HEALINGMONK-AI-ACCURACY-PERFORMANCE-REPORT.md).
 */

export interface FrameQuality {
  /** Mean luma 0–255. */
  brightness: number;
  /** Luma standard deviation 0–255. */
  contrast: number;
  /** Variance of the 4-neighbour Laplacian on the downscaled frame (higher = sharper). */
  sharpness: number;
  issues: FrameIssue[];
}

export type FrameIssue = 'too-dark' | 'too-bright' | 'low-contrast' | 'blurry';

export const QUALITY_LIMITS = {
  minBrightness: 45,
  maxBrightness: 220,
  minContrast: 18,
  /** On a ~192 px wide frame; ordinary in-focus room scenes are well above this. */
  minSharpness: 25,
};

export const FRAME_ISSUE_TEXT: Record<FrameIssue, string> = {
  'too-dark': 'Image is too dark — add light in front of the patient',
  'too-bright': 'Image is over-exposed — avoid a bright window or light behind/in front of the camera',
  'low-contrast': 'Low contrast — use a plain background that differs from the clothing',
  blurry: 'Image looks blurred — hold the camera steady and ask the patient to stay still',
};

/** Quality from an RGBA pixel buffer (ImageData.data layout). */
export function assessFrameQuality(rgba: ArrayLike<number>, width: number, height: number): FrameQuality {
  const n = width * height;
  const luma = new Float32Array(n);
  let sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const y = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    luma[i] = y;
    sum += y;
  }
  const mean = n ? sum / n : 0;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (luma[i] - mean) ** 2;
  const contrast = n ? Math.sqrt(varSum / n) : 0;

  // Laplacian variance (classic focus measure) on interior pixels.
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * luma[i];
      lapSum += lap;
      lapSq += lap * lap;
      count++;
    }
  }
  const lapMean = count ? lapSum / count : 0;
  const sharpness = count ? lapSq / count - lapMean * lapMean : 0;

  const issues: FrameIssue[] = [];
  if (mean < QUALITY_LIMITS.minBrightness) issues.push('too-dark');
  else if (mean > QUALITY_LIMITS.maxBrightness) issues.push('too-bright');
  if (contrast < QUALITY_LIMITS.minContrast) issues.push('low-contrast');
  // A flat frame has no edges at all — that's a contrast problem, not blur.
  else if (sharpness < QUALITY_LIMITS.minSharpness) issues.push('blurry');

  return {
    brightness: Math.round(mean),
    contrast: Math.round(contrast),
    sharpness: Math.round(sharpness),
    issues,
  };
}

const SAMPLE_W = 192;

/** Downscale the current video frame and assess it. Null if it can't be read. */
export function assessVideoFrame(video: HTMLVideoElement): FrameQuality | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  try {
    const w = SAMPLE_W;
    const h = Math.max(1, Math.round((vh / vw) * w));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return assessFrameQuality(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    // Tainted canvas (cross-origin remote stream) or no 2D context.
    return null;
  }
}
