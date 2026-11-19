import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { AutoScrollBar } from '../components/AutoScrollBar';
import { ChapterCredit } from '../components/ChapterCredit';
import { ChaptersSheet } from '../components/ChaptersSheet';
import { PullNext } from '../components/PullNext';
import { ReaderPages } from '../components/ReaderPages';
import { ReaderTools } from '../components/ReaderTools';
import { TopBar } from '../components/TopBar';
import { tapAction } from '../lib/autoScroll';
import { useChapters } from '../lib/chapters';
import { removeDownload, savedChapter } from '../lib/downloads';
import { fmt } from '../lib/format';
import { usePageLoads } from '../lib/pageLoads';
import { nextChapter, preloadChapter } from '../lib/preload';
import { readProgress } from '../lib/progress';
import { usePullNext } from '../lib/pullNext';
import { useScrollModes } from '../lib/scrollModes';
import { getSpot, setSpot, spotAt, type Spot } from '../lib/spots';
import { findSeries, setLast } from '../lib/store';
import type { Series } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { zoomable } from '../lib/zoom';
import * as mangadex from '../sources/mangadex';

/** How long the loading screen stays at least, in ms, from when the chapter opens. */
const COVER_MIN = 1000;

/** The built-in reader for chapter `n`, MangaDex chapters only. It remounts for each chapter. */
export function Reader({ x, n }: { x: Series; n: number }) {
  const { navigate, goBack, toast } = useApp();
  const chs = useChapters(x.md);
  const list = chs?.status === 'ready' ? chs.list.chapters : [];
  // A chapter saved for offline reading opens from the device, even with no chapter list to find it in.
  const saved = useRef(savedChapter(x.id, n)).current;
  const c = list.find((k) => k.num === n) ?? saved?.c;
  const readable = c && !c.ext ? c : undefined;
  const pages = useLoad(readable?.id ?? null, () => (saved ? Promise.resolve(saved.pages) : mangadex.pages(readable!.id)));
  const done = pages?.state === 'done';
  const wrap = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const zoom = useRef<ReturnType<typeof zoomable> | null>(null);
  const [bar, setBar] = useState(true);
  const [toTop, setToTop] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const scroll = useScrollModes(done, chaptersOpen);
  // Read by the tap handler, which is set up once per chapter.
  const tapScrollRef = useRef(scroll.tapScroll);
  tapScrollRef.current = scroll.tapScroll;
  // The loading screen: 'on' until the pages that fill the first screen have shown, then 'out' while it fades, then gone.
  const [cover, setCover] = useState<'on' | 'out' | null>('on');
  const opened = useRef(performance.now());
  const { shown, onImgLoad, onImgError } = usePageLoads(pagesRef, readable, !!saved);
  // Where the bar was last shown, or the highest point scrolled to since; scrolling 30px down from there hides it.
  // Scrolling up leaves it hidden; a tap brings it back.
  const base = useRef(0);
  // Where this chapter was left, to open it there again once the pages down to that spot have loaded.
  const [resume, setResume] = useState(() => getSpot(x.id, n));
  const fromTop = useRef(!resume).current;
  // Where the reader is now, saved on leaving; null at the end of the chapter, so it opens at the top again.
  // Undefined until the pages are measured, so leaving while they load keeps the saved spot.
  const spot = useRef<Spot | null | undefined>(undefined);
  const finished = useRef(false);

  useEffect(() => {
    const save = () => spot.current !== undefined && setSpot(x.id, n, spot.current);
    const hide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      save();
    };
  }, [x.id, n]);

  // Opening a chapter where it was left: the pages above that spot load first, so it lands on the same picture.
  useLayoutEffect(() => {
    if (!resume || !done) return;
    const el = pagesRef.current?.children[resume.i];
    if (!el) return setResume(null);
    if (pages.value.some((_, i) => i <= resume.i && !shown[i])) return;
    const b = el.getBoundingClientRect();
    scrollBy(0, b.top + resume.f * b.height);
    base.current = scrollY;
    setResume(null);
  }, [resume, done, shown]);

  useEffect(() => {
    if (!done || !wrap.current || !pagesRef.current) return;
    const z = zoomable(wrap.current, pagesRef.current, (y) => {
      const act = tapScrollRef.current ? tapAction(y, innerHeight) : 'bar';
      if (act === 'bar') {
        base.current = scrollY;
        setBar((b) => !b);
        return;
      }
      // Most of a screen, so the last lines stay in view to read on from.
      const top = innerHeight * 0.8 * (act === 'up' ? -1 : 1);
      scrollBy({ top, behavior: scrollMotion() });
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

  // The track along the bottom: how far through the pages, kept up to date as pages load and change height.
  // Reading to the end of the last page, which it only reaches once every page has loaded or failed, marks the chapter read.
  // It is measured once a frame at most and set on the track itself: re-rendering the reader on every scroll event
  // made scrolling stutter on iPhone.
  useEffect(() => {
    if (!done || resume) return;
    const loading = pages.value.findIndex((_, i) => !shown[i]);
    let raf = 0;
    const update = () => {
      raf = 0;
      const boxes = [...(pagesRef.current?.children ?? [])].map((e) => e.getBoundingClientRect());
      // The pages are already gone when the reader closes; there is nothing to measure then.
      if (!boxes.length) return;
      const p = readProgress(boxes, innerHeight, loading < 0 ? boxes.length : loading);
      track.current?.style.setProperty('transform', `scaleX(${p})`);
      track.current?.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      spot.current = p < 1 ? spotAt(boxes) : null;
      if (p < 1 || finished.current) return;
      finished.current = true;
      // Saved chapters are for reading ahead; once read, the room goes to the next ones.
      if (saved) removeDownload(saved.c.id);
      if (n > (findSeries(x.id)?.last || 0)) {
        setLast(x.id, n);
        toast(`Chapter ${fmt(n)} marked read`, true);
      }
    };
    const later = () => {
      raf ||= requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', later, { passive: true });
    addEventListener('resize', later);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('scroll', later);
      removeEventListener('resize', later);
    };
  }, [done, shown, resume, x.id, n, toast]);

  // A chapter opened at its top stays there until the loading screen lifts. After App's scrollTo(0, 0), iPhone Safari
  // can put back where the previous chapter's pull or flick left the page, part way down this chapter, where the
  // pages the loading screen waits for never start loading.
  useLayoutEffect(() => {
    if (cover !== 'on' || !fromTop) return;
    const top = () => {
      if (scrollY) scrollTo(0, 0);
    };
    top();
    addEventListener('scroll', top, { passive: true });
    return () => removeEventListener('scroll', top);
  }, [cover, done]);

  // The loading screen lifts once every page that starts on the first screen has shown or failed, or the chapter
  // can't be shown (a message says why).
  const failed = (chs?.status === 'error' && !readable) || pages?.state === 'error' || (chs?.status === 'ready' && !readable);
  useLayoutEffect(() => {
    if (cover !== 'on' || (resume && !failed)) return;
    const waiting = done ? pages.value.findIndex((_, i) => !shown[i]) : 0;
    const el = pagesRef.current?.children[waiting];
    const ready = failed || waiting < 0 || (!!el && el.getBoundingClientRect().top >= innerHeight);
    if (!ready) return;
    // Even a chapter that is already loaded keeps it up for COVER_MIN, so it never flashes.
    const t = setTimeout(() => setCover('out'), COVER_MIN - (performance.now() - opened.current));
    return () => clearTimeout(t);
  }, [cover, failed, done, shown, resume]);

  const prev = [...list].reverse().find((k) => k.num < n);
  const next = nextChapter(list, n);
  // Not every page: one that failed, or one scrolled past too fast to load, would keep the end from ever counting.
  const lastShown = done && !!shown[pages.value.length - 1];

  // Once the last page has shown or failed, load the next chapter ahead so it opens at once. Never marks anything read.
  useEffect(() => {
    if (lastShown && next && !savedChapter(x.id, next.num)) return preloadChapter(next);
  }, [lastShown, next?.id]);

  // Pulling up at the end of the chapter opens the next one, with the ring that ends the pages filling.
  // Only once the last page has shown or failed, so a loading chapter never skips ahead.
  const pullsOn = lastShown && next && !next.ext ? next.num : undefined;
  const pulled = usePullNext(x.id, pullsOn);

  const toSeries = () => goBack({ name: 'series', id: x.id });
  const backToTop = () => {
    setBar(true);
    scrollTo({ top: 0, behavior: scrollMotion() });
  };
  const toChapter = (to: number) => navigate({ name: 'reader', id: x.id, n: to }, true);
  const zoomBy = (d: number) => {
    const z = zoom.current?.zoomBy(d);
    // Zooming scrolls to keep the middle in place; that is not the reader scrolling on.
    base.current = scrollY;
    if (z) toast(`Zoom ${Math.round(z * 100)}%`, true);
  };

  let content: ReactNode;
  if (chs?.status === 'error' && !readable) content = <p className="hint">Could not load this chapter ({chs.error}). Go back and try again.</p>;
  else if (chs?.status === 'ready' && !readable)
    content = <p className="hint">Chapter {fmt(n)} can't be read here. Go back and pick another chapter or source.</p>;
  else if (pages?.state === 'error') content = <p className="hint">Could not load this chapter ({pages.error}). Try again, or switch to a different source.</p>;
  else if (!readable || pages?.state !== 'done') content = <p className="hint">Loading pages…</p>;
  else {
    content = (
      <>
        <ReaderPages
          c={readable}
          pages={pages.value}
          shown={shown}
          eagerTo={resume ? resume.i : -1}
          wrapRef={wrap}
          pagesRef={pagesRef}
          onLoad={onImgLoad}
          onError={onImgError}
        />
        <div className="endbar">
          {/* A chapter readable here opens by pulling up at the end; only one on an official site keeps a button. */}
          {next?.ext && (
            <button className="btn" onClick={() => toChapter(next.num)}>
              Ch. {fmt(next.num)} ›
            </button>
          )}
          {!next && (
            <button className="btn" onClick={toSeries}>
              Back to series
            </button>
          )}
        </div>
      </>
    );
  }

  const lastNum = list[list.length - 1]?.num;
  return (
    <>
      {done && <div ref={track} className="rtrack" role="progressbar" aria-label="Chapter progress" aria-valuenow={0} />}
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
          {readable && <ChapterCredit c={readable} />}
        </div>
        <ReaderTools
          title={x.title}
          chapters={list.length > 0}
          chaptersOpen={chaptersOpen}
          pages={done}
          auto={scroll.auto}
          tapScroll={scroll.tapScroll}
          onSeries={toSeries}
          onChapters={() => setChaptersOpen(true)}
          onAuto={scroll.toggleAuto}
          onTapScroll={scroll.toggleTapScroll}
          onZoom={zoomBy}
        />
      </TopBar>
      <div id="strip" className={pulled ? 'pulling' : undefined} style={pulled ? { transform: `translateY(${-pulled}px)` } : undefined}>
        {content}
        {pullsOn !== undefined && <PullNext pulled={pulled} />}
      </div>
      {scroll.auto && done && (
        <AutoScrollBar paused={scroll.paused} speed={scroll.speed} onPause={scroll.setPaused} onSpeed={scroll.changeSpeed} onStop={scroll.toggleAuto} />
      )}
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

/** Smooth scrolling, unless the device asks for reduced motion. */
function scrollMotion(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
