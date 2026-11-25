// Service worker: precaches the app and serves it cache-first so it works offline.
// Bump VERSION (and APP_VERSION in version.js to match) for every release: the new cache
// replaces the old one and the new build loads the next time the app is opened.
'use strict';

const VERSION = '0.10.0';
const CACHE = 'simple-kcal-' + VERSION;
const FILES = [
  './',
  'index.html',
  'style.css',
  'calc/index.js',
  'calc/values.js',
  'calc/dates.js',
  'calc/recipes.js',
  'calc/entries.js',
  'calc/totals.js',
  'calc/format.js',
  'calc/search.js',
  'calc/data.js',
  'app.js',
  'version.js',
  'ui/add.js',
  'ui/amount.js',
  'ui/apply.js',
  'ui/copy.js',
  'ui/dom.js',
  'ui/entry.js',
  'ui/food.js',
  'ui/history.js',
  'ui/ingredient.js',
  'ui/library.js',
  'ui/log.js',
  'ui/messages.js',
  'ui/nav.js',
  'ui/recipe.js',
  'ui/settings.js',
  'ui/store.js',
  'ui/text.js',
  'ui/today.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' skips the browser's HTTP cache so a new version never precaches stale files.
      Promise.all(FILES.map((url) =>
        fetch(new Request(url, { cache: 'reload' })).then((res) => {
          if (!res.ok) throw new Error('Precache failed for ' + url + ': ' + res.status);
          return cache.put(url, res);
        })
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('simple-kcal-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req, { ignoreSearch: true }).then((hit) => {
        if (hit) return hit;
        return fetch(req).catch(() => {
          // Offline and not cached: page loads fall back to the app shell.
          if (req.mode === 'navigate') return cache.match('./');
          throw new Error('Offline and not cached: ' + req.url);
        });
      })
    )
  );
});
