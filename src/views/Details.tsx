import { useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { ChapterRows } from '../components/ChapterRows';
import { MoreInfo } from '../components/MoreInfo';
import { useReadChapter } from '../components/ReadButton';
import { imageSrc } from '../lib/api';
import { retryChapters, useChapters } from '../lib/chapters';
import { norm, plural } from '../lib/format';
import { useRanking } from '../lib/ranking';
import { addSeries, updateSeries, useStore } from '../lib/store';
import { useSwipe } from '../lib/swipe';
import type { Chapter, SearchResult } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import * as mangadex from '../sources/mangadex';
import * as anilist from '../sources/anilist';

/** A Browse result before it is added, laid out like a series page on Webtoon: a big cover, the synopsis, tags and facts, Add to My Series and, on MangaDex, its chapters. */
export function Details({ o }: { o: SearchResult }) {
  const { navigate, goBack, toast } = useApp();
  const { lib } = useStore();
  const [adding, setAdding] = useState(false);
  // The whole synopsis, rather than its first lines.
  const [open, setOpen] = useState(false);
  const swipe = useSwipe(
    (dir) => dir === 1,
    () => goBack({ name: 'search' }),
    true,
  );
  const more = useLoad(`${o.src}:${o.ref}`, () => (o.src === 'md' ? mangadex.details(String(o.ref)) : anilist.details(Number(o.ref))));
  const ex = o.src === 'md' ? lib.find((x) => x.md === o.ref) : lib.find((x) => x.al === o.ref || norm(x.title) === norm(o.title));
  const d = more?.state === 'done' ? more.value : null;
  const al = o.src === 'al' ? Number(o.ref) : d?.al;
  // A MangaDex result's AniList id comes with its details, so its ranking loads after them.
  const rank = useRanking(ex, al);

  const add = async () => {
    setAdding(true);
    const n = addSeries({ title: o.title, cover: o.cover, md: o.src === 'md' ? String(o.ref) : null, al: o.src === 'al' ? o.ref : null, links: o.links || [] });
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

  // MangaDex links most series to AniList, which has the trailer of the series or its anime.
  const trailer = useLoad(al ? `trailer:${al}` : null, () => anilist.trailer(al!));
  const line = d && [d.status, d.year, d.chapters && `${plural(d.chapters, 'chapter')}${o.src === 'md' ? ' in English' : ''}`];
  const long = o.desc.length > 240;

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
        {d && d.authors.length > 0 && <div className="sub">{d.authors.join(', ')}</div>}
        <p className={`about${open ? ' open' : ''}`}>{o.desc || 'No synopsis yet.'}</p>
        {long && (
          <button className="more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Less' : 'More'}
          </button>
        )}
        {d && d.tags.length > 0 && (
          <ul className="tags" aria-label="Tags">
            {d.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {more?.state === 'error' ? (
          <p className="sub">Could not load more about this series ({more.error}). Go back and open it again.</p>
        ) : (
          <p className="sub">{[o.src === 'md' ? 'On MangaDex' : 'On AniList', ...(line || ['Loading…'])].filter(Boolean).join(' · ')}</p>
        )}
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
        {trailer?.state === 'done' && trailer.value && (
          <section className="trailer" aria-label="Trailer">
            <h3>Trailer</h3>
            {trailer.value.title && <p className="sub">{trailer.value.title}</p>}
            {/* YouTube's player refuses to play without the page's origin as referrer, which the app otherwise never sends. */}
            <iframe
              src={trailer.value.embed}
              title={`Trailer on ${trailer.value.site}`}
              referrerPolicy="strict-origin-when-cross-origin"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </section>
        )}
        {trailer?.state === 'error' && <p className="sub">Could not check AniList for a trailer ({trailer.error}). Go back and open this series again.</p>}
      </div>
      {d && <MoreInGenre o={o} tags={d.tags} />}
      {chapters}
      {o.src === 'md' && (
        <p className="credit">
          Chapters and data from MangaDex. Scanlation groups are credited on each chapter.{' '}
          <a href={mangadex.mangaUrl(String(o.ref))} target="_blank" rel="noopener noreferrer">
            View on MangaDex ↗
          </a>
        </p>
      )}
    </div>
  );
}

/** A row of popular MangaDex series in this series' first MangaDex genre, each opening its own details. Nothing shows when it has no MangaDex genre. */
function MoreInGenre({ o, tags }: { o: SearchResult; tags: string[] }) {
  const { navigate } = useApp();
  const genre = mangadex.GENRES.find((g) => tags.includes(g.name));
  const more = useLoad(genre ? genre.id : null, () => mangadex.browse(genre!.id, 'follows'));
  const list = more?.state === 'done' ? more.value.filter((k) => !(k.src === o.src && k.ref === o.ref)) : [];
  if (!genre || (more?.state === 'done' && !list.length)) return null;
  return (
    <section aria-label={`More in ${genre.name}`}>
      <h3 className="shelfh">More in {genre.name}</h3>
      {more?.state === 'error' ? (
        <p className="hint">
          Could not load more {genre.name} series from MangaDex ({more.error}). Go back and open this series again.
        </p>
      ) : more?.state === 'done' ? (
        <div className="shelf">
          {list.map((k) => (
            <button key={k.ref} className="card" onClick={() => navigate({ name: 'details', o: k })}>
              {k.cover ? <img src={imageSrc(k.cover)} referrerPolicy="same-origin" loading="lazy" alt="" /> : <span className="cover" />}
              <span className="ct">{k.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="hint">Loading…</p>
      )}
    </section>
  );
}
