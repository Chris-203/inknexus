import { host } from './lib/links';
import { loadState, newSeries, saveState } from './lib/storage';
import type { Series, State } from './lib/types';

/** The library, saved to localStorage under 'longstrip' on every change. */
export let S: State = loadState();

export const save = () => saveState(S);
export const find = (id: string | undefined): Series | undefined => S.lib.find((x) => x.id === id);

export function addSeries(o: Parameters<typeof newSeries>[0]): Series {
  const x = newSeries(o);
  S.lib.push(x);
  save();
  return x;
}

export function removeSeries(id: string) {
  S.lib = S.lib.filter((x) => x.id !== id);
  save();
}

/** Set the last chapter read; the series moves to the front of the library. */
export function setLast(x: Series, n: number) {
  x.last = Math.max(0, n);
  x.t = Date.now();
  save();
}

export function replaceState(next: State) {
  S = next;
  save();
}

/** Every source of a series as a chip: 'md' for MangaDex, 'l<index>' for each link. */
export const sourcesOf = (x: Series) => [
  ...(x.md ? [{ k: 'md', n: 'MangaDex', h: !!x.mdh }] : []),
  ...x.links.map((l, i) => ({ k: 'l' + i, n: l.label || host(l.url), h: !!l.h })),
];

export function setHidden(x: Series, k: string, h: boolean) {
  if (k === 'md') x.mdh = h;
  else {
    const l = x.links[+k.slice(1)];
    if (l) l.h = h;
  }
}
