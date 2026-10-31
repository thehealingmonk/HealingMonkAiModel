import { useState } from 'react';
import { Ruler, ChevronDown, ChevronUp } from 'lucide-react';
import {
  LiveMeasureSettings,
  LiveScaleSource,
  DISTANCE_MIN_CM,
  DISTANCE_MAX_CM,
} from '@/lib/ergo/liveMeasure';

interface Props {
  settings: LiveMeasureSettings;
  onChange: (s: LiveMeasureSettings) => void;
  /** Where the current scale came from (null = nothing to measure yet). */
  source: LiveScaleSource | null;
}

// Small overlay on the camera that sets how live sizes are scaled.
export default function LiveMeasurePanel({ settings, onChange, source }: Props) {
  const [open, setOpen] = useState(false);
  const [heightText, setHeightText] = useState(settings.statureCm ? String(settings.statureCm) : '');

  const sourceText =
    source === 'height'
      ? 'Scaled from your height (accurate near you)'
      : source === 'distance'
        ? `Approx. — object ~${settings.distanceCm} cm from camera`
        : 'Waiting for camera…';

  return (
    <div className="absolute top-36 left-3 z-30 max-w-[calc(100%-6rem)] sm:max-w-xs">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="bg-black/70 hover:bg-black/85 text-white text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5 shadow-lg"
      >
        <Ruler className="w-4 h-4 text-sky-300" />
        Live size (H × W)
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      <p className={`mt-1 text-[11px] px-2 ${source === 'height' ? 'text-emerald-300' : 'text-amber-200'}`}>
        {sourceText}
      </p>

      {open && (
        <div className="mt-2 bg-black/80 backdrop-blur rounded-xl p-3 text-white text-xs space-y-3 shadow-xl">
          <label className="block">
            <span className="font-semibold">Your height (cm) — best accuracy</span>
            <input
              type="number"
              inputMode="numeric"
              min={120}
              max={215}
              placeholder="e.g. 170"
              value={heightText}
              onChange={(e) => {
                setHeightText(e.target.value);
                const v = Number(e.target.value);
                onChange({ ...settings, statureCm: e.target.value && Number.isFinite(v) ? v : null });
              }}
              className="mt-1 w-full rounded-lg bg-white/10 border border-white/20 px-2 py-1.5 text-white placeholder:text-gray-400"
            />
            <span className="block mt-1 text-gray-400">
              Stand fully in frame (head to feet). Objects next to you are then sized from your height.
            </span>
          </label>

          <label className="block">
            <span className="font-semibold">Distance from camera: {settings.distanceCm} cm</span>
            <input
              type="range"
              min={DISTANCE_MIN_CM}
              max={DISTANCE_MAX_CM}
              step={10}
              value={settings.distanceCm}
              onChange={(e) => onChange({ ...settings, distanceCm: Number(e.target.value) })}
              className="mt-1 w-full accent-sky-400"
            />
            <span className="block mt-1 text-gray-400">
              Used when your height isn't available — e.g. scanning a bottle or chair alone.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
