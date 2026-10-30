import { useSyncExternalStore } from 'react';
import { createChanges } from './changes';
import { linkName } from './links';
import { loadState, newSeries, saveState } from './storage';
import type { SearchResult, Series, Shelf, State } from './types';

/** The library, saved to localStorage under 'longstrip' on every change. Changes replace objects, so React sees them. */
let state: State = loadState();
const changes = createChanges();

function commit(next: State) {
  state = next;
  saveState(state);
  changes.emit();
}

export function getState(): State {
  return state;
}

export function useStore(): State {
  return useSyncExternalStore(changes.subscribe, getState);
}

export function findSeries(id: string): Series | undefined {
  return state.lib.find((x) => x.id === id);
}

/** Change one series. */
export function updateSeries(id: string, change: (x: Series) => Partial<Series>) {
  commit({ ...state, lib: state.lib.map((x) => (x.id === id ? { ...x, ...change(x) } : x)) });
}

/** Set the last chapter read; the series moves to the front of the library. */
export function setLast(id: string, n: number) {
  updateSeries(id, () => ({ last: Math.max(0, n), t: Date.now() }));
}

export function addSeries(o: Parameters<typeof newSeries>[0]): Series {
  const x = newSeries(o);
  commit({ ...state, lib: [...state.lib, x] });
  return x;
}

/** Remove one or more series from the library. */
export function removeSeries(...ids: string[]) {
  commit({ ...state, lib: state.lib.filter((x) => !ids.includes(x.id)) });
}

/** Move one or more series to a shelf. Reading is the default, so it is saved as no shelf. */
export function setShelf(ids: string[], shelf: Shelf) {
  commit({ ...state, lib: state.lib.map((x) => (ids.includes(x.id) ? { ...x, shelf: shelf === 'reading' ? undefined : shelf } : x)) });
}

export function toggleSort() {
  commit({ ...state, sort: state.sort === 'asc' ? 'desc' : 'asc' });
}

export function replaceState(next: State) {
  commit(next);
}

/** Every source of a series as a chip: 'md' for MangaDex, 'l<index>' for each link. */
export function sourcesOf(x: Series) {
  return [...(x.md ? [{ k: 'md', n: 'MangaDex', h: !!x.mdh }] : []), ...x.links.map((l, i) => ({ k: 'l' + i, n: linkName(l), h: !!l.h }))];
}

/**
 * A MangaDex or AniList search result as a source of `x`: its id, its cover when `x` has none or has the cover of the
 * match it replaces, and for AniList the official links `x` lacks.
 */
export function sourceFrom(x: Series, o: SearchResult): Partial<Series> {
  const replaced = o.src === 'md' ? x.md && x.cover.includes('mangadex.org') : x.al !== null && x.cover.includes('anilist.co');
  const cover = (replaced && o.cover) || x.cover || o.cover;
  if (o.src === 'md') return { md: String(o.ref), mdh: false, cover };
  const fresh = (o.links || []).filter((l) => !x.links.some((k) => k.url === l.url));
  return { al: o.ref, cover, links: [...x.links, ...fresh] };
}

/**
 * `into` with what `x` has that it lacks: links to other pages, the MangaDex and AniList matches, a cover, and the
 * further last chapter. `into` keeps its name, shelf and chosen source.
 */
export function joined(into: Series, x: Series): Series {
  const links = [...into.links, ...x.links.filter((l) => !into.links.some((k) => k.url === l.url))];
  const md = into.md ? {} : { md: x.md, mdh: x.mdh };
  const al = into.al !== null ? {} : { al: x.al, info: x.info };
  return { ...into, ...md, ...al, cover: into.cover || x.cover, links, last: Math.max(into.last, x.last), t: Math.max(into.t, x.t) };
}

/** Merge series `id` into series `into` and remove it. */
export function mergeSeries(id: string, into: string) {
  const x = findSeries(id);
  if (x) commit({ ...state, lib: state.lib.flatMap((y) => (y.id === id ? [] : y.id === into ? [joined(y, x)] : [y])) });
}

/** Move link `i` of series `id`, at its chapter, to series `into`, or to a new series named `title` when `into` is null. Gives the id it went to. */
export function moveLink(id: string, i: number, into: string | null, title: string): string {
  const x = findSeries(id)!;
  const l = x.links[i]!;
  const moved = newSeries({ title, links: [l], last: l.rn });
  // Links after `i` move up one, so a chosen link source is chosen again.
  const left = (y: Series) => ({ ...y, links: y.links.filter((_, k) => k !== i), src: y.src === 'md' ? 'md' : '' });
  const lib = state.lib.map((y) => (y.id === id ? left(y) : y.id === into ? joined(y, moved) : y));
  commit({ ...state, lib: into ? lib : [...lib, moved] });
  return into ?? moved.id;
}

/** Hide or show source `k` of a series. Showing it also selects it; hiding clears the selection. */
export function setHidden(id: string, k: string, h: boolean) {
  updateSeries(id, (x) => ({
    ...(k === 'md' ? { mdh: h } : { links: x.links.map((l, i) => ('l' + i === k ? { ...l, h } : l)) }),
    src: h ? '' : k,
  }));
}

/** The source a series shows: its chosen one while visible, otherwise the first visible one, or '' when all are hidden. */
export function shownSource(x: Series): string {
  const vis = sourcesOf(x).filter((q) => !q.h);
  return vis.some((q) => q.k === x.src) ? x.src! : vis[0]?.k || '';
}
