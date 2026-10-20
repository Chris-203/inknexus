import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { HouseIcon } from '../components/HouseIcon';
import { ReadButton } from '../components/ReadButton';
import { Sheet, useSheet } from '../components/Sheet';
import { TopBar } from '../components/TopBar';
import { imageSrc } from '../lib/api';
import { useChapters } from '../lib/chapters';
import { chapterNote, fmt } from '../lib/format';
import { nextChapter, preloadChapter } from '../lib/preload';
import { readProgress } from '../lib/progress';
import { findSeries, setLast, useStore } from '../lib/store';
import type { Chapter, Series } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { zoomable } from '../lib/zoom';
import * as mangadex from '../sources/mangadex';

/** How long the loading screen stays at least, in ms, once it shows. */
const COVER_MIN = 1000;

/** The built-in reader for chapter `n`, MangaDex chapters only. It remounts for each chapter. */
export function Reader({ x, n }: { x: Series; n: number }) {
  const { navigate, goBack, toast } = useApp();
  const chs = useChapters(x.md);
  const list = chs?.status === 'ready' ? chs.list.chapters : [];
  const c = list.find((k) => k.num === n);
  const readable = c && !c.ext ? c : undefined;
  const pages = useLoad(readable?.id ?? null, () => mangadex.pages(readable!.id));
  const done = pages?.state === 'done';
  const wrap = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const failedOnce = useRef(false);
  const zoom = useRef<ReturnType<typeof zoomable> | null>(null);
  const [bar, setBar] = useState(true);
  const [toTop, setToTop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  // The loading screen: 'on' until the pages that fill the first screen have shown, then 'out' while it fades, then gone.
  const [cover, setCover] = useState<'on' | 'out' | null>('on');
  const opened = useRef(performance.now());
  // Pages that showed or failed for good, by index; the rest are still loading.
  const [shown, setShown] = useState<Record<number, 'done' | 'failed'>>({});
  const mark = (i: number, st: 'done' | 'failed') => setShown((m) => ({ ...m, [i]: st }));
  // Where the bar was last shown, or the highest point scrolled to since; scrolling 30px down from there hides it.
  // Scrolling up leaves it hidden; a tap brings it back.
  const base = useRef(0);

  // Reaching the end of the chapter marks it read.
  useEffect(() => {
    if (!done || !end.current) return;
    const ob = new IntersectionObserver(
      (en) => {
        if (!en[0]?.isIntersecting) return;
        ob.disconnect();
        if (n > (findSeries(x.id)?.last || 0)) {
          setLast(x.id, n);
          toast(`Chapter ${fmt(n)} marked read`);
        }
      },
      { threshold: 0.6 },
    );
    ob.observe(end.current);
    return () => ob.disconnect();
  }, [done, x.id, n, toast]);

  useEffect(() => {
    if (!done || !wrap.current || !pagesRef.current) return;
    const z = zoomable(wrap.current, pagesRef.current, () => {
      base.current = scrollY;
      setBar((b) => !b);
    });
    zoom.current = z;
    return z.stop;
  }, [done]);

  useEffect(() => {
    const onScroll = () => {
      base.current = Math.min(base.current, scrollY);
      if (scrollY - base.current > 30) setBar(false);
      setToTop(scrollY > innerHeight);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  // The track along the top: how far through the pages, kept up to date as pages load and change height.
  useEffect(() => {
    if (!done) return;
    const update = () => {
      const r = pagesRef.current?.getBoundingClientRect();
      if (r) setProgress(readProgress(r.top, r.height, innerHeight));
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, [done, shown]);

  // The loading screen lifts once every page that starts on the first screen has shown or failed, or the chapter
  // can't be shown (a message says why).
  const failed = chs?.status === 'error' || pages?.state === 'error' || (chs?.status === 'ready' && !readable);
  useLayoutEffect(() => {
    if (cover !== 'on') return;
    const waiting = done ? pages.value.findIndex((_, i) => !shown[i]) : 0;
    const el = pagesRef.current?.children[waiting];
    const ready = failed || waiting < 0 || (!!el && el.getBoundingClientRect().top >= innerHeight);
    if (!ready) return;
    // It shows only after 150ms (styles.css), so a chapter ready before then skips it. Once it shows, it stays a
    // second so it never flashes.
    const since = performance.now() - opened.current;
    if (since < 150) return setCover(null);
    const t = setTimeout(() => setCover('out'), 150 + COVER_MIN - since);
    return () => clearTimeout(t);
  }, [cover, failed, done, shown]);

  const prev = [...list].reverse().find((k) => k.num < n);
  const next = nextChapter(list, n);
  const allShown = done && pages.value.every((_, i) => shown[i] === 'done');

  // Once every page has shown, load the next chapter ahead so it opens at once. Never marks anything read.
  useEffect(() => {
    if (allShown) return preloadChapter(next);
  }, [allShown, next?.id]);

  const toSeries = () => goBack({ name: 'series', id: x.id });
  const backToTop = () => {
    setBar(true);
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const toChapter = (to: number) => navigate({ name: 'reader', id: x.id, n: to }, true);
  const zoomBy = (d: number) => {
    const z = zoom.current?.zoomBy(d);
    // Zooming scrolls to keep the middle in place; that is not the reader scrolling on.
    base.current = scrollY;
    if (z) toast(`Zoom ${Math.round(z * 100)}%`);
  };

  // Data-saver image first; on error try full quality once, then mark the page failed and say so once for this chapter.
  const onImgError = (img: HTMLImageElement, i: number, b: string) => {
    if (!img.dataset.t && b) {
      img.dataset.t = '1';
      img.src = b;
      return;
    }
    mark(i, 'failed');
    if (!failedOnce.current) {
      failedOnce.current = true;
      toast('Some pages failed to load. Try again later, or read this chapter on MangaDex.');
    }
  };

  let content: ReactNode;
  if (chs?.status === 'error') content = <p className="hint">Could not load this chapter ({chs.error}). Go back and try again.</p>;
  else if (chs?.status === 'ready' && !readable)
    content = <p className="hint">Chapter {fmt(n)} can't be read here. Go back and pick another chapter or source.</p>;
  else if (pages?.state === 'error') content = <p className="hint">Could not load this chapter ({pages.error}). Try again, or switch to a different source.</p>;
  else if (!readable || pages?.state !== 'done') content = <p className="hint">Loading pages…</p>;
  else {
    const credit = (
      <p className="credit">
        {readable.grp ? `Scanlation by ${readable.grp}` : 'No scanlation group credited'} · via MangaDex.{' '}
        <a href={mangadex.chapterUrl(readable.id)} target="_blank" rel="noopener noreferrer">
          Read on MangaDex ↗
        </a>
      </p>
    );
    content = (
      <>
        {credit}
        <div id="zwrap" ref={wrap}>
          <div id="pages" ref={pagesRef}>
            {pages.value.map((u, i) => (
              <div key={u.a} className={`pg ${shown[i] || ''}`}>
                <img
                  src={imageSrc(u.a)}
                  referrerPolicy="same-origin"
                  loading="lazy"
                  alt={`Page ${i + 1}`}
                  onLoad={() => mark(i, 'done')}
                  onError={(e) => onImgError(e.currentTarget, i, u.b && imageSrc(u.b))}
                />
                {shown[i] === 'failed' ? (
                  <div className="pgmsg">
                    <p>Page {i + 1} failed to load.</p>
                    <a className="btn" href={mangadex.chapterUrl(readable.id)} target="_blank" rel="noopener noreferrer">
                      Read on MangaDex ↗
                    </a>
                  </div>
                ) : (
                  shown[i] !== 'done' && <p className="pgmsg">Loading page {i + 1}…</p>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="endbar" ref={end}>
          {prev && (
            <button className="btn ghost" onClick={() => toChapter(prev.num)}>
              ‹ Ch. {fmt(prev.num)}
            </button>
          )}
          {next ? (
            <button className="btn" onClick={() => toChapter(next.num)}>
              Ch. {fmt(next.num)} ›
            </button>
          ) : (
            <button className="btn" onClick={toSeries}>
              Back to series
            </button>
          )}
        </div>
        {credit}
      </>
    );
  }

  const lastNum = list[list.length - 1]?.num;
  return (
    <>
      {done && (
        <div
          className="rtrack"
          role="progressbar"
          aria-label="Chapter progress"
          aria-valuenow={Math.round(progress * 100)}
          style={{ transform: `scaleX(${progress})` }}
        />
      )}
      <TopBar off={!bar} over>
        <div className="chnav">
          <button aria-label={prev ? `Chapter ${fmt(prev.num)}` : 'No earlier chapter'} disabled={!prev} onClick={() => prev && toChapter(prev.num)}>
            ‹
          </button>
          <b>
            Ch. {fmt(n)}
            {lastNum !== undefined && <span> / {fmt(lastNum)}</span>}
          </b>
          <button aria-label={next ? `Chapter ${fmt(next.num)}` : 'No later chapter'} disabled={!next} onClick={() => next && toChapter(next.num)}>
            ›
          </button>
        </div>
        <div className="rtools" role="toolbar" aria-label="Reader" aria-orientation="vertical">
          <button className="ibtn" aria-label={`Back to ${x.title}`} onClick={toSeries}>
            <HouseIcon />
          </button>
          <button className="ibtn" aria-label="Chapters" aria-expanded={chaptersOpen} disabled={!list.length} onClick={() => setChaptersOpen(true)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6h11M9 12h11M9 18h11" />
              <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
            </svg>
          </button>
          {done && (
            <>
              <button className="ibtn" aria-label="Zoom in" onClick={() => zoomBy(0.5)}>
                +
              </button>
              <button className="ibtn" aria-label="Zoom out" onClick={() => zoomBy(-0.5)}>
                −
              </button>
            </>
          )}
        </div>
      </TopBar>
      <div id="strip">{content}</div>
      {cover && (
        <div id="rcover" className={cover} role="status" onAnimationEnd={() => cover === 'out' && setCover(null)}>
          <img src="/favicon.svg" alt="" />
          <b>InkNexus</b>
          <span>Loading Ch. {fmt(n)}…</span>
        </div>
      )}
      {toTop && (
        <button id="totop" className="ibtn float" aria-label="Back to top" onClick={backToTop}>
          ↑
        </button>
      )}
      {chaptersOpen && <ChaptersSheet x={x} list={list} n={n} onClose={() => setChaptersOpen(false)} />}
    </>
  );
}

/** Every chapter of the series, in the library's sort order, opened on the one being read. */
function ChaptersSheet({ x, list, n, onClose }: { x: Series; list: Chapter[]; n: number; onClose: () => void }) {
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
