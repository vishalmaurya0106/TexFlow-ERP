const CACHE_NAME = 'texflow-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg'
];

// Install Service Worker and activate immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate Service Worker, claim clients, & Clear old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))))
      .then(() => self.clients.claim())
  );
});

// Fetch handler: strictly same-origin GET static assets only (never cache Firestore/API/mutations)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
