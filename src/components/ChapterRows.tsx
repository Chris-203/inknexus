import type { ReactNode } from 'react';
import { fmt } from '../lib/format';
import { toggleSort, useStore } from '../lib/store';
import type { Chapter } from '../lib/types';

/** A loaded MangaDex chapter list with its sort button and range, oldest or newest first as the library sorts. `row` draws each chapter. */
export function ChapterRows({ all, row }: { all: Chapter[]; row: (c: Chapter) => ReactNode }) {
  const { sort } = useStore();
  const asc = sort === 'asc';
  const first = all[0]!;
  return (
    <>
      <div className="row mid">
        <button className="btn ghost sm" onClick={toggleSort}>
          Sort: {asc ? 'oldest first' : 'newest first'}
        </button>
        <span className="sub">
          {all.length} chapters, {fmt(first.num)} to {fmt(all[all.length - 1]!.num)}
        </span>
      </div>
      {first.num > 1 && <p className="hint">Chapters before {fmt(first.num)} are not on MangaDex. Try another source for those.</p>}
      {(asc ? all : [...all].reverse()).map(row)}
    </>
  );
}
