import { useRef, useState } from 'react';
import { chapterText, savedCheck } from './ChapterRows';
import { Sheet, useSheet } from './Sheet';
import { useApp } from '../context';
import { why } from '../lib/api';
import { saveChapter, useDownloads } from '../lib/downloads';
import { fmt, plural } from '../lib/format';
import { useStore } from '../lib/store';
import type { Chapter, Series as SeriesT } from '../lib/types';

/**
 * Choose chapters to save for reading offline, as on WEBTOON: tap a chapter to tick it, or drag along the circles to
 * tick or untick several. It fills the screen; saved chapters show a check, and saving and waiting ones their state, instead of a circle.
 */
export function DownloadSheet({ x, all, onClose }: { x: SeriesT; all: Chapter[]; onClose: () => void }) {
  const { toast } = useApp();
  const { sort } = useStore();
  const { saved, saving, waiting } = useDownloads();
  const sheet = useSheet(onClose);
  const [picked, setPicked] = useState<string[]>([]);
  // What a drag along the circles does to each chapter it passes: tick (true) or untick (false); null when not dragging.
  const drag = useRef<boolean | null>(null);
  const list = all.filter((c) => !c.ext);
  const pick = (id: string, on: boolean) => setPicked((p) => (on === p.includes(id) ? p : on ? [...p, id] : p.filter((k) => k !== id)));
  const state = (c: Chapter) => {
    if (saved.some((d) => d.c.id === c.id)) return <span className="dlstate">{savedCheck()}</span>;
    if (saving?.id === c.id) return <span className="dlstate">{saving.total ? `${saving.done}/${saving.total}` : 'Saving'}</span>;
    if (waiting.includes(c.id)) return <span className="dlstate">Waiting</span>;
  };
  const download = () => {
    for (const c of list.filter((c) => picked.includes(c.id)))
      saveChapter(x, c).then(
        (done) => done && toast(`Saved ch. ${fmt(c.num)} for reading offline`, true),
        (e) => toast(`Could not save ch. ${fmt(c.num)} for offline (${why(e)}). Choose it in Download to try again.`),
      );
    toast(`Saving ${plural(picked.length, 'chapter')}. Find them in My Series under Downloaded.`);
    sheet.close();
  };
  return (
    <Sheet label="Download" sheet={sheet} full>
      <div className="pickhead">
        <h2>Download</h2>
        <button className="ibtn plain" aria-label="Close" onClick={sheet.close}>
          ×
        </button>
      </div>
      <p className="hint">Tap chapters to choose them, or drag along the circles to choose several.</p>
      <div
        className="picklist"
        onPointerMove={(e) => {
          const id = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-ch]')?.dataset.ch;
          if (id && drag.current !== null) pick(id, drag.current);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {(sort === 'asc' ? list : [...list].reverse()).map((c) => {
          const on = picked.includes(c.id);
          const st = state(c);
          return (
            <div key={c.id} className="chrow" data-ch={st ? undefined : c.id}>
              <button className="ch" role="checkbox" aria-checked={on} disabled={!!st} onClick={() => pick(c.id, !on)}>
                {chapterText(c)}
              </button>
              {st || (
                <span
                  className={`circ${on ? ' on' : ''}`}
                  aria-hidden="true"
                  onPointerDown={(e) => {
                    // A touch would otherwise keep sending its moves to this circle and scroll the list.
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    drag.current = !on;
                    pick(c.id, !on);
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="pickfoot">
        <button className="btn" disabled={!picked.length} onClick={download}>
          Download{picked.length > 0 && ` (${picked.length})`}
        </button>
      </div>
    </Sheet>
  );
}
