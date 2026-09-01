'use client';

import { useEffect } from 'react';

// Registers the service worker so the app is installable ("Add to Home Screen")
// and its shell works offline. No-op where service workers aren't supported.
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {});
    // Register after load so it never competes with the first paint.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
