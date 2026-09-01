'use client';

import { useState } from 'react';
import { Download, X, Share, Plus, MoreVertical } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

// Short-lived flag so a user who dismisses the floating button isn't nagged
// again on every navigation within the session.
const DISMISS_KEY = 'hm_install_dismissed';

function iosHelp() {
  return (
    <div className="mt-2 space-y-1.5 text-xs text-slate-600">
      <p className="flex items-center gap-1.5">
        <Share className="h-3.5 w-3.5 text-emerald-600" /> Tap the <b>Share</b> icon in Safari.
      </p>
      <p className="flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5 text-emerald-600" /> Choose <b>Add to Home Screen</b>.
      </p>
    </div>
  );
}

// Fallback steps for browsers/desktops that don't expose a native install
// prompt (or where it hasn't fired yet). Covers Chrome/Edge desktop + Android.
function manualHelp() {
  return (
    <div className="mt-2 space-y-1.5 text-xs text-slate-600">
      <p className="flex items-center gap-1.5">
        <MoreVertical className="h-3.5 w-3.5 text-emerald-600" /> Open your browser menu (<b>⋮</b> / <b>Install</b> icon in the address bar).
      </p>
      <p className="flex items-center gap-1.5">
        <Download className="h-3.5 w-3.5 text-emerald-600" /> Choose <b>Install app</b> / <b>Add to Home screen</b>.
      </p>
    </div>
  );
}

/**
 * Inline "Install app" button for the site navigation / footer. Always rendered
 * (unless already installed): when the browser offers a native install prompt
 * we replay it; otherwise we show manual Add-to-Home-Screen steps so users on
 * every browser and device get a way in.
 */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const { canInstall, installed, isIOS, promptInstall } = useInstallPrompt();
  const [showHelp, setShowHelp] = useState(false);

  // Hide only when the app is genuinely running as an installed PWA.
  if (installed) return null;

  const onClick = () => {
    if (canInstall) promptInstall();
    else setShowHelp((v) => !v);
  };

  return (
    <div className="relative">
      <button
        onClick={onClick}
        className={
          className ||
          'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-50 px-3.5 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100'
        }
      >
        <Download className="h-4 w-4" /> Install app
      </button>
      {showHelp && !canInstall && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-900/10 bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">{isIOS ? 'Install on iPhone' : 'Install this app'}</p>
          {isIOS ? iosHelp() : manualHelp()}
        </div>
      )}
    </div>
  );
}

/**
 * Floating, dismissible install prompt shown app-wide (dashboards, login, etc.)
 * where there's no site nav. Appears once the app becomes installable.
 */
export function FloatingInstallButton() {
  const { canInstall, installed, isIOS, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  });
  const [showHelp, setShowHelp] = useState(false);

  if (installed || dismissed || (!canInstall && !isIOS)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage may be unavailable */
    }
  };

  const onInstall = () => {
    if (canInstall) promptInstall();
    else setShowHelp((v) => !v);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-white/95 py-1.5 pl-4 pr-1.5 shadow-lg shadow-emerald-900/10 backdrop-blur">
        <button
          onClick={onInstall}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"
        >
          <Download className="h-4 w-4" /> Install app
        </button>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {showHelp && isIOS && (
        <div className="mt-2 w-64 rounded-xl border border-slate-900/10 bg-white p-3 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">Install on iPhone</p>
          {iosHelp()}
        </div>
      )}
    </div>
  );
}

export default InstallAppButton;
