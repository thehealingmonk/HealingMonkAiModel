/* HealingMonk service worker — makes the app installable (PWA) and keeps the
   static shell available offline. It is deliberately conservative:
   - only same-origin GET requests are cached,
   - API / auth responses (/api/*) are never cached (always live, private),
   - everything is network-first so clinic data stays fresh; the cache is only
     a fallback when the device is offline. */
const CACHE = 'hm-shell-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache dynamic/private data

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        // Network failed — fall back to the cache. CRITICAL: respondWith() must
        // ALWAYS receive a Response. If nothing is cached, caches.match resolves
        // to `undefined`, which throws "Failed to convert value to 'Response'"
        // and breaks the page. So we guard every path and, for a navigation,
        // fall back to the cached app shell so the SPA still boots offline.
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          const shell = (await caches.match('/')) || (await caches.match('/index.html'));
          if (shell) return shell;
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      })
  );
});
