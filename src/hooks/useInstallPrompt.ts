'use client';

import { useCallback, useEffect, useState } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt` on installable PWAs; we stash
// the event so an "Install app" button can trigger the native install prompt on
// demand. iOS Safari never fires it — there we surface Add-to-Home-Screen steps.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallPrompt {
  /** True once the browser has offered a native install prompt we can replay. */
  canInstall: boolean;
  /** True when the app is already running installed (standalone). */
  installed: boolean;
  /** True on iOS Safari, where install is a manual Share → Add to Home Screen. */
  isIOS: boolean;
  /** Fire the native prompt. Returns false when none is available. */
  promptInstall: () => Promise<boolean>;
}

// `beforeinstallprompt` fires early — frequently before any React component has
// mounted and attached a listener. If we only listened inside a component's
// effect we'd miss it and the install button would never appear. So we capture
// it once at module load (the moment this file is first imported on the client)
// and keep the latest event in a module-level store that hooks subscribe to.
let deferredEvent: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

if (typeof window !== 'undefined') {
  if (isStandalone()) installed = true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredEvent = null;
    notify();
  });
}

export function useInstallPrompt(): InstallPrompt {
  const [, force] = useState(0);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream);

    const rerender = () => force((n) => n + 1);
    listeners.add(rerender);
    // Re-sync in case the event fired between module load and this subscription.
    rerender();
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const d = deferredEvent;
    if (!d) return false;
    await d.prompt();
    await d.userChoice;
    deferredEvent = null;
    notify();
    return true;
  }, []);

  return { canInstall: !!deferredEvent, installed, isIOS, promptInstall };
}
