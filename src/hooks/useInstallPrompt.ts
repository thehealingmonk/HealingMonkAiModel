'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

export function useInstallPrompt(): InstallPrompt {
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari exposes this non-standard flag when launched from the home screen.
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) setInstalled(true);

    const ua = navigator.userAgent || '';
    setIsIOS(/iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
      deferred.current = null;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const d = deferred.current;
    if (!d) return false;
    await d.prompt();
    await d.userChoice;
    deferred.current = null;
    setCanInstall(false);
    return true;
  }, []);

  return { canInstall, installed, isIOS, promptInstall };
}
