import { IMAGE_RELAY, imageSrc } from './api';
import { saveData } from './preload';
import type { Series } from './types';

/**
 * Covers of the series in My Series, kept in Cache Storage under CACHE, where public/sw.js answers the image relay from,
 * so they show at once and offline, and the browser does not clear them from its HTTP cache under pressure. Covers shown
 * anywhere else (Browse, More like this) stay in the HTTP cache only. Covers from other sites are left out: the
 * browser could only keep them as opaque responses, which use far more storage than they hold.
 */
export const CACHE = 'inknexus-covers';

/** The relay addresses of the MangaDex covers of `lib`, as Cache Storage keys them. */
export function coverUrls(lib: Series[], base: string): string[] {
  const srcs = lib.flatMap((x) => (x.cover ? [imageSrc(x.cover)] : [])).filter((src) => src.startsWith(IMAGE_RELAY));
  return [...new Set(srcs.map((src) => new URL(src, base).href))];
}

/** Keep the covers of `lib` and drop those of series no longer in it. Missing ones load one at a time, none on slow or data-saving connections. */
async function sync(lib: Series[]) {
  const cache = await caches.open(CACHE);
  const want = coverUrls(lib, location.href);
  const have = new Set((await cache.keys()).map((r) => r.url));
  await Promise.all([...have].filter((u) => !want.includes(u)).map((u) => cache.delete(u)));
  if (saveData()) return;
  // The first failure ends this round; the next change to the library tries the rest again.
  for (const u of want) if (!have.has(u)) await cache.add(u);
}

/** The library waiting for the round running now to end, so a burst of changes runs one more round, not one each. */
let queued: Series[] | null = null;
let running = false;

/** Keep the covers of the series in My Series on the device. Only with the service worker, which only the built app registers. */
export function keepCovers(lib: Series[]) {
  if (typeof caches === 'undefined' || !globalThis.navigator?.serviceWorker?.controller) return;
  queued = lib;
  if (running) return;
  running = true;
  void (async () => {
    while (queued) {
      const l = queued;
      queued = null;
      // A failed round changes nothing that matters: the covers still load through the relay.
      await sync(l).catch(() => {});
    }
    running = false;
  })();
}
