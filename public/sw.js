// Service worker: lets InkNexus open without a connection and read chapters saved for offline reading.
// The page comes from the network whenever it can, so a new version shows on the next launch as before; the copy from
// the last launch is used only when the network fails. Build files it lists come from the device once kept. MangaDex images come from the chapters saved by
// src/lib/downloads.ts, the My Series covers kept by src/lib/covers.ts or the other covers kept here when they are there,
// otherwise through the image relay as usual. Nothing else under /api/ is touched.

const APP = 'inknexus-app';
// Shared with src/lib/downloads.ts and src/lib/covers.ts.
const SAVED = ['inknexus-downloads', 'inknexus-covers'];
// Every other MangaDex cover shown (Browse, More like this), newest last, so after a few days away they show from the
// device rather than each waiting on the relay again: iPhone Safari clears its HTTP cache far sooner than Cache Storage.
// A cover's file name changes with its image, so a kept one never goes stale.
const THUMBS = 'inknexus-thumbs';
const KEEP_THUMBS = 300;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const r = e.request;
  const url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname === '/api/mdimage') e.respondWith(saved(e));
  else if (url.pathname.startsWith('/assets/')) e.respondWith(build(e));
  else if (!url.pathname.startsWith('/api/')) e.respondWith(app(e));
});

async function saved(e) {
  const r = e.request;
  for (const name of [...SAVED, THUMBS]) {
    const hit = await caches.open(name).then((c) => c.match(r, { ignoreVary: true }));
    if (hit) return hit;
  }
  const res = await fetch(r);
  // Only covers an <img> asked for: src/lib/covers.ts saves My Series covers itself, with a plain fetch.
  if (res.ok && r.destination === 'image' && isCover(r.url)) e.waitUntil(keepThumb(r, res.clone()));
  return res;
}

function isCover(relayed) {
  return (new URL(relayed).searchParams.get('url') || '').startsWith('https://uploads.mangadex.org/covers/');
}

async function keepThumb(r, res) {
  const cache = await caches.open(THUMBS);
  await cache.put(r, res);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, -KEEP_THUMBS).map((k) => cache.delete(k)));
}

// Build files carry a hash of their content in their name, so a kept one is served without asking the network; a new
// build has new names, and the page that lists them still comes from the network first.
async function build(e) {
  const cache = await caches.open(APP);
  return (await cache.match(e.request)) || app(e);
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
