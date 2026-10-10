import { useSyncExternalStore } from 'react';
import { host } from './links';
import { loadState, newSeries, saveState } from './storage';
import type { Series, State } from './types';

/** The library, saved to localStorage under 'longstrip' on every change. Changes replace objects, so React sees them. */
let state: State = loadState();
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  saveState(state);
  listeners.forEach((l) => l());
}

export const getState = () => state;

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
  );
}

export const findSeries = (id: string | undefined): Series | undefined => state.lib.find((x) => x.id === id);

/** Change one series. */
export function updateSeries(id: string, change: (x: Series) => Partial<Series>) {
  commit({ ...state, lib: state.lib.map((x) => (x.id === id ? { ...x, ...change(x) } : x)) });
}

/** Set the last chapter read; the series moves to the front of the library. */
export const setLast = (id: string, n: number) => updateSeries(id, () => ({ last: Math.max(0, n), t: Date.now() }));

export function addSeries(o: Parameters<typeof newSeries>[0]): Series {
  const x = newSeries(o);
  commit({ ...state, lib: [...state.lib, x] });
  return x;
}

export const removeSeries = (id: string) => commit({ ...state, lib: state.lib.filter((x) => x.id !== id) });

export const toggleSort = () => commit({ ...state, sort: state.sort === 'asc' ? 'desc' : 'asc' });

export const replaceState = (next: State) => commit(next);

/** Every source of a series as a chip: 'md' for MangaDex, 'l<index>' for each link. */
export const sourcesOf = (x: Series) => [
  ...(x.md ? [{ k: 'md', n: 'MangaDex', h: !!x.mdh }] : []),
  ...x.links.map((l, i) => ({ k: 'l' + i, n: l.label || host(l.url), h: !!l.h })),
];

/** Hide or show source `k` of a series. Showing it also selects it; hiding clears the selection. */
export function setHidden(id: string, k: string, h: boolean) {
  updateSeries(id, (x) => ({
    ...(k === 'md' ? { mdh: h } : { links: x.links.map((l, i) => ('l' + i === k ? { ...l, h } : l)) }),
    src: h ? '' : k,
  }));
}
