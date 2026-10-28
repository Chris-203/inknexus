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

/** A MangaDex or AniList search result as a source of `x`: its id, its cover when `x` has none, and for AniList the official links `x` lacks. */
export function sourceFrom(x: Series, o: SearchResult): Partial<Series> {
  if (o.src === 'md') return { md: String(o.ref), mdh: false, cover: x.cover || o.cover };
  const fresh = (o.links || []).filter((l) => !x.links.some((k) => k.url === l.url));
  return { al: o.ref, cover: x.cover || o.cover, links: [...x.links, ...fresh] };
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
