import { Landmark } from '@/lib/poseDetection';

/**
 * One-Euro filter for live pose landmarks.
 *
 * MediaPipe's raw per-frame landmarks jitter by a pixel or two even when the
 * subject is perfectly still, which makes the skeleton overlay shimmer and the
 * clinical angles flicker by ±1–2°. A One-Euro filter is the standard fix for
 * noisy interactive signals: it smooths hard when the point is slow (removing
 * jitter) and barely smooths when the point moves fast (so there is no visible
 * lag when the patient actually moves). See Casiez et al., CHI 2012.
 *
 * Each landmark axis (x, y, z) is filtered independently; visibility is passed
 * through unchanged.
 */

export interface OneEuroConfig {
  /** Baseline cutoff frequency (Hz). Lower = smoother but laggier when still. */
  minCutoff: number;
  /** Speed coefficient. Higher = follows fast motion more aggressively. */
  beta: number;
  /** Cutoff for the derivative used to detect motion speed. */
  dCutoff: number;
}

// Tuned for a person holding a clinical pose: a low baseline cutoff kills the
// residual per-frame shimmer so the skeleton, landmarks and — most visibly — the
// plumb/deviation line sit rock-steady when the subject is still. `beta` still
// lets the filter open up the moment they actually move, so there is no drag
// when they step or turn. Lower minCutoff = steadier line (this is the setting
// that stops the deviation line from "always moving"); raise it if it feels laggy.
const DEFAULT_CONFIG: OneEuroConfig = {
  minCutoff: 0.9,
  beta: 0.008,
  dCutoff: 1.0,
};

const TAU = 2 * Math.PI;

// Confidence-aware smoothing band. At/above HIGH the landmark is trusted and the
// filter behaves exactly as the tuned One-Euro (no added lag — critical for the
// eyes/ears/joints when they are clearly visible). As visibility falls toward
// LOW the position low-pass is damped down to FLOOR so an occluded / uncertain
// joint HOLDS its last stable position instead of chasing MediaPipe's noisy,
// jumpy low-confidence estimate. This is the occlusion / no-snap behaviour.
const CONF_HIGH = 0.6;
const CONF_LOW = 0.3;
const CONF_FLOOR = 0.15;

/** Map a landmark visibility to a [FLOOR..1] weight applied to the position alpha. */
function confidenceWeight(vis: number): number {
  if (vis >= CONF_HIGH) return 1;
  if (vis <= CONF_LOW) return CONF_FLOOR;
  const t = (vis - CONF_LOW) / (CONF_HIGH - CONF_LOW);
  return CONF_FLOOR + t * (1 - CONF_FLOOR);
}

/** Smoothing factor for a low-pass step given a cutoff frequency and dt. */
function smoothingAlpha(cutoff: number, dt: number): number {
  const r = TAU * cutoff * dt;
  return r / (r + 1);
}

/** A single scalar One-Euro channel. */
class OneEuroChannel {
  private xPrev = 0;
  private dxPrev = 0;
  private initialized = false;

  constructor(private cfg: OneEuroConfig) {}

  /** `conf` in [0..1] (landmark visibility): lower confidence → more hold. */
  filter(x: number, dt: number, conf = 1): number {
    if (!this.initialized || dt <= 0) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.initialized = true;
      return x;
    }
    // Estimate (and low-pass) the rate of change.
    const dx = (x - this.xPrev) / dt;
    const aD = smoothingAlpha(this.cfg.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    // Motion-adaptive cutoff: faster motion → higher cutoff → less smoothing.
    const cutoff = this.cfg.minCutoff + this.cfg.beta * Math.abs(dxHat);
    // Confidence-aware: shrink the position step when the landmark is uncertain
    // so it damps toward its last stable value instead of snapping to noise.
    const a = smoothingAlpha(cutoff, dt) * confidenceWeight(conf);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    // Damp the stored velocity by confidence too, so a low-confidence spike does
    // not leave a large residual velocity that overshoots on re-acquisition.
    this.dxPrev = dxHat;
    return xHat;
  }

  reset() {
    this.initialized = false;
  }
}

/**
 * Filters a full array of MediaPipe landmarks frame-to-frame. Create one
 * instance per camera/video; call {@link reset} whenever tracking is lost so a
 * re-acquired body does not snap from the last known position.
 */
export class PoseSmoother {
  private channels: OneEuroChannel[][] = [];
  private lastTimeSec = 0;
  private cfg: OneEuroConfig;

  constructor(cfg: Partial<OneEuroConfig> = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...cfg };
  }

  reset() {
    for (const axes of this.channels) for (const c of axes) c.reset();
    this.lastTimeSec = 0;
  }

  /** Return a smoothed copy of `landmarks`. `timestampMs` should increase. */
  smooth(landmarks: Landmark[], timestampMs: number): Landmark[] {
    const tSec = timestampMs / 1000;
    const dt = this.lastTimeSec ? tSec - this.lastTimeSec : 0;
    this.lastTimeSec = tSec;

    // (Re)allocate one channel-triple per landmark on first use / count change.
    if (this.channels.length !== landmarks.length) {
      this.channels = landmarks.map(() => [
        new OneEuroChannel(this.cfg),
        new OneEuroChannel(this.cfg),
        new OneEuroChannel(this.cfg),
      ]);
    }

    return landmarks.map((lm, i) => {
      const [cx, cy, cz] = this.channels[i];
      // Visibility drives confidence-aware damping; treat missing as fully
      // confident so models without a visibility field behave as before.
      const conf = lm.visibility ?? 1;
      return {
        x: cx.filter(lm.x, dt, conf),
        y: cy.filter(lm.y, dt, conf),
        z: cz.filter(lm.z ?? 0, dt, conf),
        visibility: lm.visibility,
      };
    });
  }
}
