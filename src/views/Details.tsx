import { useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { About } from '../components/About';
import { ChapterRows } from '../components/ChapterRows';
import { MoreLikeThis } from '../components/MoreLikeThis';
import { MoreInfo } from '../components/MoreInfo';
import { useReadChapter } from '../components/ReadButton';
import { Trailer } from '../components/Trailer';
import { imageSrc } from '../lib/api';
import { retryChapters, useChapters } from '../lib/chapters';
import { seriesDetails } from '../lib/details';
import { norm } from '../lib/format';
import { useRanking } from '../lib/ranking';
import { addSeries, updateSeries, useStore } from '../lib/store';
import { useSwipe } from '../lib/swipe';
import type { Chapter, SearchResult } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import * as mangadex from '../sources/mangadex';

/** A Browse result before it is added, laid out like a series page on Webtoon: a big cover, the synopsis, tags and facts, Add to My Series and, on MangaDex, its chapters. */
export function Details({ o }: { o: SearchResult }) {
  const { navigate, goBack, toast } = useApp();
  const { lib } = useStore();
  const [adding, setAdding] = useState(false);
  const swipe = useSwipe(
    (dir) => dir === 1,
    () => goBack({ name: 'search' }),
    true,
  );
  const more = useLoad(`${o.src}:${o.ref}`, () =>
    seriesDetails({ title: o.title, al: o.src === 'al' ? Number(o.ref) : (o.al ?? null), md: o.src === 'md' ? String(o.ref) : null }),
  );
  const ex = o.src === 'md' ? lib.find((x) => x.md === o.ref) : lib.find((x) => x.al === o.ref || norm(x.title) === norm(o.title));
  const d = more?.state === 'done' ? more.value : null;
  const al = o.src === 'al' ? Number(o.ref) : d?.al;
  // A MangaDex result's AniList id comes with its details, so its ranking loads after them.
  const rank = useRanking(ex, al);

  const add = async () => {
    setAdding(true);
    const n = addSeries({
      title: o.title,
      cover: o.cover,
      md: o.src === 'md' ? String(o.ref) : null,
      al: o.src === 'al' ? o.ref : (o.al ?? null),
      links: o.links || [],
    });
    if (al && rank?.state === 'done') updateSeries(n.id, () => ({ info: { ...rank.value, al, at: Date.now() } }));
    let msg = 'Added to My Series';
    if (o.src === 'al') {
      try {
        const hit = (await mangadex.search(o.title)).find((k) => norm(k.title) === norm(o.title));
        if (hit) {
          updateSeries(n.id, () => ({ md: String(hit.ref) }));
          msg = 'Added. Found it on MangaDex too';
        }
      } catch {
        // MangaDex is optional here: the series is added with its AniList links either way.
      }
    }
    toast(msg);
    // The series opens in My Series, in place of this screen, so going back from it goes to My Series.
    navigate({ name: 'library' }, true);
    navigate({ name: 'series', id: n.id });
    return n;
  };

  const chs = useChapters(o.src === 'md' ? String(o.ref) : null);
  const read = useReadChapter();
  // Reading a chapter adds the series first, so the reader has a series to keep progress in.
  const readChapter = async (c: Chapter) => read((ex ?? (await add())).id, c);

  let chapters: ReactNode = null;
  if (chs?.status === 'loading') chapters = <p className="hint">Loading chapters…</p>;
  else if (chs?.status === 'error')
    chapters = (
      <>
        <p className="hint">Could not load chapters from MangaDex ({chs.error}).</p>
        <div className="pad">
          <button className="btn ghost" onClick={() => retryChapters(String(o.ref))}>
            Try again
          </button>
        </div>
      </>
    );
  else if (chs?.status === 'ready')
    chapters = chs.list.chapters.length ? (
      <ChapterRows all={chs.list.chapters} disabled={adding} open={(c) => void readChapter(c)} />
    ) : (
      <p className="hint">MangaDex has no English chapters to read for this title.</p>
    );

  return (
    <div ref={swipe}>
      <div className="backbar">
        <button className="ibtn" aria-label="Back" onClick={() => goBack({ name: 'search' })}>
          ‹
        </button>
      </div>
      <div className="hero">{o.cover ? <img className="cover" src={imageSrc(o.cover)} referrerPolicy="same-origin" alt="" /> : <span className="cover" />}</div>
      <div className="dtl">
        <h2>{o.title}</h2>
        <About desc={o.desc} d={more} on={o.src === 'md' ? 'On MangaDex' : 'On AniList'} english={o.src === 'md'} />
        <MoreInfo r={rank} />
        {ex ? (
          <button className="btn" onClick={() => navigate({ name: 'series', id: ex.id })}>
            Open in My Series
          </button>
        ) : (
          <button className="btn" disabled={adding} onClick={() => void add()}>
            Add to My Series
          </button>
        )}
        <Trailer al={al} />
      </div>
      <MoreLikeThis x={{ title: o.title, al: o.src === 'al' ? Number(o.ref) : null, md: o.src === 'md' ? String(o.ref) : null }} />
      {chapters}
      {o.src === 'md' && (
        <p className="credit">
          Chapters and data from MangaDex{al ? ', with the score and more tags from AniList' : ''}. Scanlation groups are credited on each chapter.{' '}
          <a href={mangadex.mangaUrl(String(o.ref))} target="_blank" rel="noopener noreferrer">
            View on MangaDex ↗
          </a>
        </p>
      )}
    </div>
  );
}
