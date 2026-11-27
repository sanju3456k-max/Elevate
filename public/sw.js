// Service Worker for Elevate Math Practice PWA (WebAPK Compliant)
const CACHE_NAME = 'elevate-pwa-v18';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/manifest.json',
  '/favicon.ico?v=17',
  '/favicon.svg?v=17',
  '/icon-192.png?v=17',
  '/icon-512.png?v=17',
  '/icon-maskable-192.png?v=17',
  '/icon-maskable-512.png?v=17',
  '/apple-touch-icon.png?v=17',
  '/assets/preplens-icon.png?v=17',
  '/assets/preplens-icon.svg?v=17',
  '/assets/elevate-watermark.svg?v=17'
];

// Install: Cache critical shell assets safely without failing if one asset is missing
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          fetch(url, { cache: 'no-cache' })
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch((err) => {
              console.warn('[SW] Could not precache:', url, err);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up previous cache versions & claim all clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: Stale-while-revalidate for static assets, network-first with offline fallback for navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin extension requests
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // Bypass backend API calls, Firebase API, telemetry, or binary APK downloads
  if (
    request.url.includes('/api/') ||
    request.url.includes('firestore.googleapis.com') || 
    request.url.includes('identitytoolkit.googleapis.com') ||
    request.url.endsWith('.apk') ||
    request.url.includes('.apk?')
  ) {
    return;
  }

  // Handle SPA Navigation requests
  if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('/index.html') || await cache.match('/');
          if (cachedIndex) return cachedIndex;
          return new Response('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // Handle static assets & scripts with 0ms cache-first strategy + graceful offline fallback
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      if (cachedResponse) {
        // Return cached version immediately for 0ms offline launch
        // Background revalidate if online
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Not in cache: fetch from network and store copy in cache
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      } catch (err) {
        console.warn('[SW] Offline asset fetch failed:', request.url);
        // Safe fallbacks so script/style tags don't throw uncaught network errors that block React
        if (request.destination === 'script' || request.url.endsWith('.js') || request.url.endsWith('.tsx')) {
          return new Response('/* Offline JS fallback */', {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' }
          });
        }
        if (request.destination === 'style' || request.url.endsWith('.css')) {
          return new Response('/* Offline CSS fallback */', {
            status: 200,
            headers: { 'Content-Type': 'text/css' }
          });
        }
        return new Response('', { status: 204, statusText: 'Offline Asset Unavailable' });
      }
    })
  );
});

// Listen for skip waiting message from app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle notification click on Web / PWA
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (event.notification.data?.actionTab) {
            client.postMessage({
              type: 'NAVIGATE_NOTIFICATION',
              payload: event.notification.data,
            });
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle push notification if web push payload arrives
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'Elevate Updates';
    const options = {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      tag: data.tag || `elevate-${Date.now()}`,
      data: data.data || {},
      vibrate: [200, 100, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.warn('[SW] Push parse error:', err);
  }
});

