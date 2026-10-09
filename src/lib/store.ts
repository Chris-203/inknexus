import { useSyncExternalStore } from 'react';
import { loadState, newSeries, saveState } from './storage';
import type { Series, State } from './types';

/** The saved library. Every change is saved to localStorage right away, under the 'longstrip' key. */
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
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const findSeries = (id: string | undefined): Series | undefined => state.lib.find((x) => x.id === id);

/** Change one series. `touch` also moves it to the front of the library. */
export function updateSeries(id: string, change: (x: Series) => Partial<Series>, touch = false) {
  commit({
    ...state,
    lib: state.lib.map((x) => (x.id === id ? { ...x, ...change(x), ...(touch ? { t: Date.now() } : {}) } : x)),
  });
}

/** Set the last chapter read and move the series to the front. */
export const setLast = (id: string, last: number) => updateSeries(id, () => ({ last: Math.max(0, last) }), true);

export function addSeries(o: Parameters<typeof newSeries>[0]): Series {
  const x = newSeries(o);
  commit({ ...state, lib: [...state.lib, x] });
  return x;
}

export const removeSeries = (id: string) => commit({ ...state, lib: state.lib.filter((x) => x.id !== id) });

export const toggleSort = () => commit({ ...state, sort: state.sort === 'asc' ? 'desc' : 'asc' });

export const replaceState = (next: State) => commit(next);
