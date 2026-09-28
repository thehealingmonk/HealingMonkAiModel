/**
 * UI-side shared types for the ErgoAI flow. Re-exports the engine types plus a
 * small captured-frame shape used to carry snapshots + angles between steps.
 */
import { ErgoAngles, DetectedObject } from '@/lib/ergo/ergoTypes';
import { Landmark } from '@/lib/poseDetection';

export interface ErgoCapturedFrame {
  view: 'side' | 'front';
  angles: ErgoAngles;
  /** JPEG data URL with the skeleton overlay baked in (for the report). */
  imageData: string;
  timestamp: number;
}

export type ErgoCaptures = {
  side: ErgoCapturedFrame | null;
  front: ErgoCapturedFrame | null;
};

/**
 * A single side-on workstation frame: the person's pose PLUS the objects the
 * detector found in the same shot. Drives the human ↔ object relationship engine.
 * Optional throughout the flow — skipping it falls back to the human-only report.
 */
export interface ErgoWorkstationCapture {
  /** JPEG data URL with skeleton + object boxes baked in (for the report). */
  imageData: string;
  /** Raw pose landmarks for spatial (box↔joint) relationships. */
  landmarks: Landmark[] | null;
  /** Joint angles derived from the same frame. */
  angles: ErgoAngles | null;
  /** Objects detected in the frame. */
  objects: DetectedObject[];
  timestamp: number;
}
