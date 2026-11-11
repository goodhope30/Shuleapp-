// Shule App service worker - offline shell + runtime cache for CDN libraries
const VERSION = 'shule-v1.0.0';
const SHELL = ['/', '/index.html', '/manifest.json', '/js/i18n.js', '/js/app.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const TAILWIND = 'https://cdn.tailwindcss.com/3.4.17';
const CDN = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => { await c.addAll(SHELL); try { await c.put(TAILWIND, await fetch(TAILWIND, { mode: 'no-cors' })); } catch (err) {} }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return; // never cache API
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('/index.html', cp)); return r; }).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.origin === location.origin || CDN.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((r) => {
          if (r && (r.status === 200 || r.type === 'opaque')) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); }
          return r;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
