/* HealingMonk service worker — makes the app installable (PWA) and keeps a
   minimal shell available offline. Deliberately conservative and FRESH-FIRST so
   clinic data and new deploys are never stale:
   - only same-origin GET is handled; API/auth (/api/*) is never touched,
   - HTML navigations are ALWAYS network-first (so a new deploy's fresh page +
     current JS chunks load; stale HTML referencing dead chunks is what caused
     the 504/"Failed to convert to Response" errors),
   - only content-hashed static assets (/_next/static, images, fonts) are cached,
   - respondWith() ALWAYS receives a valid Response (never undefined). */
const CACHE = 'hm-shell-v3';
// AI runtime + models (MediaPipe WASM from jsdelivr, .task/.tflite from Google's
// model bucket). They are ~20 MB and every URL is VERSION-PINNED, so they are
// immutable and safe to serve CACHE-FIRST: after the first visit the AI starts
// without downloading anything. Bump this name if the pinned versions change.
const AI_CACHE = 'hm-ai-models-v1';
const SHELL = '/';

self.addEventListener('install', (event) => {
  // Precache the app shell so a failed/offline navigation always has a valid
  // fallback Response to return.
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== AI_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Is this a content-hashed / immutable static asset that is safe to cache?
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|avif|ico)$/i.test(url.pathname)
  );
}

// Pinned, immutable AI assets (see AI_CACHE).
function isAiAsset(url) {
  return (
    (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/@mediapipe/tasks-vision@')) ||
    (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/'))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'GET' && isAiAsset(url)) {
    event.respondWith(
      caches.open(AI_CACHE).then(async (cache) => {
        const cached = await cache.match(req, { ignoreVary: true });
        if (cached) return cached;
        const res = await fetch(req);
        // Store only complete, successful responses (opaque = no-cors script).
        if (res && (res.status === 200 || res.type === 'opaque')) {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })
    );
    return;
  }

  // Only handle same-origin GET. Everything else (API, cross-origin, POST…) is
  // left to the browser's default handling — we don't call respondWith at all.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // dynamic/private — always live

  const isNavigation = req.mode === 'navigate';

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Cache only successful, cacheable static assets (never HTML pages).
        if (res && res.status === 200 && res.type === 'basic' && !isNavigation && isCacheableAsset(url)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        // Network failed — return a valid Response on EVERY path.
        const cached = await caches.match(req);
        if (cached) return cached;
        if (isNavigation) {
          const shell = await caches.match(SHELL);
          if (shell) return shell;
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      })
  );
});
