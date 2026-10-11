import { norm } from './format';
import { sourcesOf } from './store';
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

/** Only duplicates whose last chapter read differs need a choice; the rest merge on their own. */
export function chaptersDiffer(d: Duplicate): boolean {
  return d.mine.last !== d.theirs.last;
}

/** One series from both versions: reading progress from the chosen one, sources from whichever has more (the library's on a tie), and the library's id. */
export function mergeSeries(mine: Series, theirs: Series, useBackup: boolean): Series {
  const base = useBackup ? theirs : mine;
  const src = sourcesOf(theirs).length > sourcesOf(mine).length ? theirs : mine;
  return { ...base, id: mine.id, md: src.md, mdh: src.mdh, al: src.al, links: src.links, src: src.src };
}

/** The library after an import: every duplicate is merged, taking the backup's reading progress where it is in `fromBackup`, and new series are added. */
export function mergeImport(lib: Series[], fresh: Series[], dupes: Duplicate[], fromBackup: Duplicate[]): Series[] {
  const merged = new Map(dupes.map((d) => [d.mine.id, mergeSeries(d.mine, d.theirs, fromBackup.includes(d))]));
  return [...lib.map((x) => merged.get(x.id) ?? x), ...fresh];
}
