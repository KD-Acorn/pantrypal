// My Pantry Club — Service Worker
// Cache version is replaced at build time by the Vite swVersionPlugin in vite.config.js.
// In dev mode this literal string is used; that's fine since the SW is prod-only.
const CACHE_VERSION = '__APP_VERSION__';
const CACHE_NAME = `mypantryclub-v${CACHE_VERSION}`;

// On install: cache the app shell entry point.
// Vite-built JS/CSS assets (content-hashed) are cached on first fetch instead of
// being enumerated here, since their filenames change with every build.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(['/', '/manifest.json']))
  );
  self.skipWaiting();
});

// On activate: delete any caches from previous versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API calls — always network, never cache.
  // Data freshness is critical for scan/recipe/pantry results.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Vite-built assets (/assets/) have content-hash filenames — immutable, cache forever.
  // Static files (/images/, /fonts/) are also safe to serve from cache.
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/fonts/')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests (HTML page loads) — network-first.
  // Falls back to the cached root shell so the app opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  // Everything else (manifest, misc GETs) — network-first, opportunistically cached.
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try the exact URL, then fall back to root shell.
    return (await caches.match(request)) ||
           (await caches.match('/')) ||
           new Response('App is offline', { status: 503 });
  }
}

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON payload — use defaults */ }

  const title = data.title || 'My Pantry Club';
  const options = {
    body: data.body || "Check what's in your pantry today!",
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
