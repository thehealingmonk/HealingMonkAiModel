import { useEffect, useState } from 'react';
import { Ruler, ChevronDown, ChevronUp, Box } from 'lucide-react';
import { isArSupported } from '@/lib/ergo/arMeasure';
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
  /** Camera → subject distance the current scale implies (cm). */
  distanceCm: number | null;
  /** Opens the AR exact-measure mode (button shown only where AR works). */
  onArMeasure?: () => void;
}

const SOURCE_TEXT: Record<LiveScaleSource, string> = {
  height: 'from your height',
  'auto-person': 'AI · from body size',
  'auto-objects': 'AI · from phone/keyboard/cup in view',
  distance: 'manual',
};

// Small overlay on the camera that sets how live sizes are scaled.
export default function LiveMeasurePanel({ settings, onChange, source, distanceCm, onArMeasure }: Props) {
  const [arOk, setArOk] = useState(false);
  useEffect(() => {
    let alive = true;
    isArSupported().then((ok) => alive && setArOk(ok));
    return () => { alive = false; };
  }, []);
  const [open, setOpen] = useState(false);
  const [heightText, setHeightText] = useState(settings.statureCm ? String(settings.statureCm) : '');

  const autoMissed = settings.autoDistance && source === 'distance';
  const sourceText = !source
    ? 'Waiting for camera…'
    : `Distance ~${distanceCm ?? settings.distanceCm} cm (${SOURCE_TEXT[source]})`;

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
      {arOk && onArMeasure && (
        <button
          type="button"
          onClick={onArMeasure}
          className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1.5 shadow-lg"
        >
          <Box className="w-4 h-4" /> AR exact measure (±1–2 cm)
        </button>
      )}
      <p className={`mt-1 text-[11px] px-2 ${source === 'height' ? 'text-emerald-300' : 'text-amber-200'}`}>
        {sourceText}
      </p>
      {autoMissed && (
        <p className="text-[11px] px-2 text-gray-300">
          AI can't judge distance yet — show a person, phone or keyboard in view, or set it below.
        </p>
      )}

      {open && (
        <div className="mt-2 bg-black/80 backdrop-blur rounded-xl p-3 text-white text-xs space-y-3 shadow-xl">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="font-semibold block">AI auto distance</span>
              <span className="text-gray-400">Judges distance from body / known objects</span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoDistance}
              onChange={(e) => onChange({ ...settings, autoDistance: e.target.checked })}
              className="w-5 h-5 accent-sky-400"
            />
          </label>

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
              Makes the AI distance more accurate. Standing head-to-feet in frame uses it directly.
            </span>
          </label>

          <label className={`block ${settings.autoDistance ? 'opacity-60' : ''}`}>
            <span className="font-semibold">
              Manual distance: {settings.distanceCm} cm{settings.autoDistance ? ' (used only if AI can\'t tell)' : ''}
            </span>
            <input
              type="range"
              min={DISTANCE_MIN_CM}
              max={DISTANCE_MAX_CM}
              step={10}
              value={settings.distanceCm}
              onChange={(e) => onChange({ ...settings, distanceCm: Number(e.target.value) })}
              className="mt-1 w-full accent-sky-400"
            />
          </label>
        </div>
      )}
    </div>
  );
}
