/**
 * UI-side shared types for the ErgoAI flow. Re-exports the engine types plus a
 * small captured-frame shape used to carry snapshots + angles between steps.
 */
import { ErgoAngles } from '@/lib/ergo/ergoTypes';

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
