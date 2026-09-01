'use client';

import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { isPanelLocked, setPanelLock } from '@/lib/panelLock';

/**
 * Header toggle shown in every signed-in console. When "locked", the app
 * remembers this device should open straight into the current dashboard —
 * so relaunching the app skips the public home page (see AppRouter).
 */
export default function PanelLockToggle() {
  const [locked, setLocked] = useState(() => isPanelLocked());

  const toggle = () => {
    const next = !locked;
    setPanelLock(next);
    setLocked(next);
  };

  return (
    <button
      onClick={toggle}
      title={locked ? 'This device opens straight to this panel. Tap to unlock.' : 'Lock the app to open straight to this panel.'}
      aria-pressed={locked}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
        locked
          ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      <span className="hidden sm:inline">{locked ? 'Locked' : 'Lock panel'}</span>
    </button>
  );
}
