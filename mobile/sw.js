/* Riff Mobile — app-shell service worker.
   Caches the interface (never the API) so the player UI opens instantly and
   remains usable while Riff is restarting. */

const CACHE = 'riff-mobile-shell-v1';

const SHELL = [
  './',
  './index.html',
  './css/tokens.css',
  './css/app.css',
  './js/core.js',
  './js/icons.js',
  './js/demo.js',
  './js/api.js',
  './js/store.js',
  './js/ui.js',
  './js/player.js',
  './js/views/common.js',
  './js/views/home.js',
  './js/views/search.js',
  './js/views/library.js',
  './js/views/collection.js',
  './js/views/player-view.js',
  './js/views/settings.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/riff.svg',
  './icons/icon.png',
  '../audio-engine.js',
  '../assets/hls.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (asset) => {
      try {
        await cache.add(new Request(asset, { cache: 'reload' }));
      } catch (e) {
        // optional assets (e.g. the shared audio engine outside the scope) may
        // be unavailable; the interface still works without them
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
