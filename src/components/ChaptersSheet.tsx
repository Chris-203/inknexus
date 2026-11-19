import { useEffect } from 'react';
import { ReadButton } from './ReadButton';
import { Sheet, useSheet } from './Sheet';
import { chapterNote, fmt } from '../lib/format';
import { useStore } from '../lib/store';
import type { Chapter, Series } from '../lib/types';

/** Every chapter of the series, in the library's sort order, opened on the one being read (`n`). */
export function ChaptersSheet({ x, list, n, onClose }: { x: Series; list: Chapter[]; n: number; onClose: () => void }) {
  const { sort } = useStore();
  const sheet = useSheet(onClose);
  useEffect(() => {
    document.querySelector('#modal [aria-current]')?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <Sheet label="Chapters" sheet={sheet}>
      <h2>Chapters</h2>
      {(sort === 'asc' ? list : [...list].reverse()).map((c) => (
        <ReadButton key={c.id} x={x} c={c} replace current={c.num === n} className={`ch${c.num <= (x.last || 0) ? ' read' : ''}`}>
          <b>Ch. {fmt(c.num)}</b>
          <span>{chapterNote(c)}</span>
        </ReadButton>
      ))}
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}
