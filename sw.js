/*
 * Service worker: makes the app installable and usable offline.
 *
 * Three caching strategies, because the kinds of content differ:
 *  - Code and markup (html/js/css/json): network-first with a cache fallback, so an
 *    installed app picks up updates as soon as it is online but still opens offline.
 *  - Immutable assets (icons): cache-first; they only change with a new filename.
 *  - Quran text + recitation audio: stale-while-revalidate into a separate runtime
 *    cache, so pages you have already visited keep working with no connection.
 */
const CACHE_VERSION = 'quran-v20';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/tajweed.js',
  './js/api.js',
  './js/audio.js',
  './js/mushaf.js',
  './js/memorize.js',
  './js/quiz.js',
  './js/lessons.js',
  './js/adhkar.js',
  './js/worship.js',
  './js/ayahactions.js',
  './js/search.js',
  './js/nativealerts.js',
  './js/alerts.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // Individual addAll failures would abort the whole install, so tolerate misses.
      .then(cache => Promise.allSettled(SHELL_ASSETS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isQuranData = url.hostname === 'api.alquran.cloud';
  // Both recitation hosts: islamic.network serves most reciters, everyayah.com
  // serves the teaching/children recitation.
  const isAudio = url.hostname === 'cdn.islamic.network' || url.hostname === 'everyayah.com';
  const isFont = url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');

  if (isQuranData || isAudio || isFont) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.origin === self.location.origin) {
    // Code and markup must pick up updates as soon as the user is online, so they
    // go network-first with a cache fallback. Pure cache-first would pin an
    // installed app to whatever JS it first cached. Immutable assets stay
    // cache-first because they never change without a new filename.
    const isCodeOrMarkup = /\.(?:html|js|css|json)$/.test(url.pathname)
      || url.pathname === '/' || request.mode === 'navigate';
    event.respondWith(isCodeOrMarkup ? networkFirst(request) : cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    // `cache: 'no-cache'` forces revalidation with the server. Without it the
    // browser's own HTTP cache can hand back stale code here, which would defeat
    // the whole point of going network-first (a 304 keeps this cheap).
    const res = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
    if (res.ok) (await caches.open(SHELL_CACHE)).put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(SHELL_CACHE)).put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(res => {
      // Opaque cross-origin responses still cache usefully for audio/fonts.
      if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  return cached || network.then(res => {
    if (res) return res;
    throw new Error('offline and uncached: ' + request.url);
  });
}
