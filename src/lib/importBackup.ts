import { norm } from './format';
import type { Series } from './types';

/** A backup series that is already in the library. */
export interface Duplicate {
  mine: Series;
  theirs: Series;
}

/** Same series by id, MangaDex id or AniList id. */
function sameIds(a: Series, b: Series): boolean {
  return a.id === b.id || (!!a.md && a.md === b.md) || (a.al !== null && a.al === b.al);
}

/** Same title, comparing letters and digits only, so titles in other scripts never match on title alone. */
function sameTitle(a: Series, b: Series): boolean {
  return !!norm(a.title) && norm(a.title) === norm(b.title);
}

/** Split a backup's series into new ones and ones the library already has. An id match wins over a title match. */
export function planImport(lib: Series[], incoming: Series[]): { fresh: Series[]; dupes: Duplicate[] } {
  const fresh: Series[] = [];
  const dupes: Duplicate[] = [];
  for (const theirs of incoming) {
    const mine = lib.find((x) => sameIds(x, theirs)) ?? lib.find((x) => sameTitle(x, theirs));
    if (mine) dupes.push({ mine, theirs });
    else fresh.push(theirs);
  }
  return { fresh, dupes };
}

/** The library after an import: each duplicate marked in `useBackup` takes the backup's version (keeping the library's id), and new series are added. */
export function mergeImport(lib: Series[], fresh: Series[], dupes: Duplicate[], useBackup: boolean[]): Series[] {
  const swap = new Map(dupes.filter((_, i) => useBackup[i]).map((d) => [d.mine.id, { ...d.theirs, id: d.mine.id }]));
  return [...lib.map((x) => swap.get(x.id) ?? x), ...fresh];
}
