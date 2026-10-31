// Service worker: lets InkNexus open without a connection and read chapters saved for offline reading.
// The app itself comes from the network whenever it can, so a new version shows on the next launch as before; the copy
// from the last launch is used only when the network fails. MangaDex images come from the chapters saved by
// src/lib/downloads.ts or the My Series covers kept by src/lib/covers.ts when they are there, otherwise through the
// image relay as usual. Nothing else under /api/ is touched.

const APP = 'inknexus-app';
// Shared with src/lib/downloads.ts and src/lib/covers.ts.
const SAVED = ['inknexus-downloads', 'inknexus-covers'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  const url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname === '/api/mdimage') e.respondWith(saved(r));
  else if (!url.pathname.startsWith('/api/')) e.respondWith(app(e));
});

async function saved(r) {
  for (const name of SAVED) {
    const hit = await caches.open(name).then((c) => c.match(r, { ignoreVary: true }));
    if (hit) return hit;
  }
  return fetch(r);
}

// Every view is the same page, so any page load is kept as '/'. After a fresh one, files of older builds are dropped.
async function app(e) {
  const page = e.request.mode === 'navigate';
  const cache = await caches.open(APP);
  try {
    const res = await fetch(e.request);
    if (res.ok) e.waitUntil(page ? keepPage(cache, res.clone()) : cache.put(e.request, res.clone()));
    return res;
  } catch {
    return (await cache.match(page ? '/' : e.request)) || Response.error();
  }
}

async function keepPage(cache, res) {
  const html = await res.clone().text();
  await cache.put('/', res);
  for (const k of await cache.keys()) {
    const path = new URL(k.url).pathname;
    if (path.startsWith('/assets/') && !html.includes(path)) await cache.delete(k);
  }
}
