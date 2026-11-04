/**
 * Privacy-preserving performance log for the AI modules.
 *
 * Records only timings (ms) and counters — never images, landmarks, names or
 * any patient data. Kept in memory (last 200 events) and inspectable from the
 * browser console via `window.__hmAiPerf.summary()` for field diagnostics.
 */

export type PerfMetric =
  | 'wasm-load'
  | 'pose-model-load'
  | 'object-model-load'
  | 'pose-warmup'
  | 'camera-open'
  | 'time-to-tracking'
  | 'inference'
  | 'capture';

export type PerfCounter = 'scan-failed' | 'validation-warning' | 'measurement-mismatch' | 'capture-unstable';

interface PerfEvent {
  metric: PerfMetric;
  ms: number;
  at: number;
  detail?: string;
}

const MAX = 200;
const events: PerfEvent[] = [];
const counters: Partial<Record<PerfCounter, number>> = {};

// Inference runs every frame — keep a cheap rolling window instead of events.
const INF_WINDOW = 120;
const inference: number[] = [];

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function recordTiming(metric: PerfMetric, ms: number, detail?: string) {
  if (!Number.isFinite(ms)) return;
  if (metric === 'inference') {
    inference.push(ms);
    if (inference.length > INF_WINDOW) inference.shift();
    return;
  }
  events.push({ metric, ms: Math.round(ms), at: Date.now(), detail });
  if (events.length > MAX) events.shift();
}

/** Start a timer; call the returned function to record it. */
export function startTimer(metric: PerfMetric, detail?: string): () => number {
  const t0 = now();
  return () => {
    const ms = now() - t0;
    recordTiming(metric, ms, detail);
    return ms;
  };
}

export function countEvent(counter: PerfCounter) {
  counters[counter] = (counters[counter] ?? 0) + 1;
}

export function perfSummary() {
  const sorted = [...inference].sort((a, b) => a - b);
  const pct = (p: number) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 10) / 10 : null);
  return {
    events: [...events],
    counters: { ...counters },
    inferenceMs: { samples: sorted.length, p50: pct(0.5), p95: pct(0.95) },
  };
}

if (typeof window !== 'undefined') {
  (window as unknown as { __hmAiPerf?: unknown }).__hmAiPerf = { summary: perfSummary };
}
