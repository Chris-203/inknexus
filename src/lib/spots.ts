import { isObj, readJson, writeJson } from './storage';

// Where the reader left each series' chapter, kept on this device only (never in the library or backups).
const SPOTS_KEY = 'inknexus-reader-spots';

/** A place in a chapter: page `i` is at the top of the screen, `f` (0 to 1) of the way down it. */
export interface Spot {
  i: number;
  f: number;
}

/** The spot at the top of the screen, from the pages' boxes on screen. Null when there are no pages. */
export function spotAt(pages: { top: number; bottom: number }[]): Spot | null {
  const i = pages.findIndex((p) => p.bottom > 0);
  const p = pages[i];
  return p ? { i, f: Math.min(1, Math.max(0, -p.top / (p.bottom - p.top))) } : null;
}

/** Where chapter `n` of series `id` was left, or null when it was not, or another chapter was left last. */
export function getSpot(id: string, n: number): Spot | null {
  const all = readJson(SPOTS_KEY);
  const s = isObj(all) ? all[id] : undefined;
  if (!isObj(s) || s.n !== n || !Number.isInteger(s.i) || typeof s.f !== 'number') return null;
  return { i: Math.max(0, s.i as number), f: Math.min(1, Math.max(0, s.f)) };
}

/** The chapter of series `id` that was left part way, if any. */
export function leftChapter(id: string): number | undefined {
  const all = readJson(SPOTS_KEY);
  const s = isObj(all) ? all[id] : undefined;
  return isObj(s) && typeof s.n === 'number' ? s.n : undefined;
}

/**
 * Remember where chapter `n` of series `id` was left, one chapter per series. Null, or the very top of the chapter,
 * forgets chapter `n`'s spot but keeps another chapter's, so a quick look at another chapter does not lose it.
 */
export function setSpot(id: string, n: number, s: Spot | null) {
  const all = readJson(SPOTS_KEY);
  const { [id]: old, ...rest } = isObj(all) ? all : {};
  if (s && (s.i || s.f)) writeJson(SPOTS_KEY, { ...rest, [id]: { n, ...s } });
  else if (isObj(old) && old.n === n) writeJson(SPOTS_KEY, rest);
}
