const CACHE_NAME = 'mpesa-app-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/styles/styles.css',
  '/js/main.js' // Add your main frontend JS file here if you have one
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});