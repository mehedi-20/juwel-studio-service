const CACHE_NAME = 'juwel-telecom-esheba-v10';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './admin.html',
  './css/style.css',
  './js/data.js',
  './js/data-uploads.js',
  './js/app.js',
  './js/admin.js',
  './js/firebase-config.js',
  './js/pdf-text-index.js',
  './js/pdf-voter-entries.js',
  './js/pdf-name-overrides.js',
  './assets/logo.svg',
  './manifest.json'
];

// Install Service Worker and cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching offline assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Never let a single missing asset break the whole install
        console.warn('[Service Worker] Pre-cache warning:', err);
        return self.skipWaiting();
      })
  );
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// A Response that is safe to hand back to respondWith() when offline
function offlineFallback(request) {
  if (request.mode === 'navigate') {
    return caches.match('./index.html').then((cached) => {
      return cached || new Response(
        '<!DOCTYPE html><html lang="bn"><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>অফলাইন</title><body style="font-family:sans-serif;text-align:center;padding:40px">' +
        '<h2>আপনি অফলাইনে আছেন</h2><p>ইন্টারনেট সংযোগ ফিরে এলে আবার চেষ্টা করুন।</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    });
  }
  return Promise.resolve(new Response('', { status: 503, statusText: 'Offline' }));
}

// Fetch interception (same-origin GET requests only)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // pass CDN/font requests straight through

  event.respondWith(
    // ignoreSearch makes ?v=x.y cache-busted URLs match the pre-cached assets
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const networkFetch = fetch(request).then((networkResponse) => {
        // Cache successful same-origin responses in the background
        if (networkResponse && networkResponse.ok) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      }).catch(() => {
        // Offline: serve the cached copy if we have one, otherwise a fallback
        return cachedResponse || offlineFallback(request);
      });

      return cachedResponse || networkFetch;
    })
  );
});
