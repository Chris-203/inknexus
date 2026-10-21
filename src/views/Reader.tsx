import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { HouseIcon } from '../components/HouseIcon';
import { ReadButton } from '../components/ReadButton';
import { Sheet, useSheet } from '../components/Sheet';
import { TopBar } from '../components/TopBar';
import { imageSrc } from '../lib/api';
import { getScrollSpeed, getTapScroll, scrollDistance, setScrollSpeed, setTapScroll, SPEEDS, stepSpeed, tapAction } from '../lib/autoScroll';
import { useChapters } from '../lib/chapters';
import { chapterNote, fmt } from '../lib/format';
import { nextChapter, preloadChapter } from '../lib/preload';
import { readProgress } from '../lib/progress';
import { getSpot, setSpot, spotAt, type Spot } from '../lib/spots';
import { findSeries, setLast, useStore } from '../lib/store';
import type { Chapter, Series } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { zoomable } from '../lib/zoom';
import * as mangadex from '../sources/mangadex';

/** How far the pages rise, in px, when pulling up at the end of a chapter to open the next one. */
const PULL = 80;

/** How long the loading screen stays at least, in ms, from when the chapter opens. */
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
  const failedOnce = useRef(false);
  const zoom = useRef<ReturnType<typeof zoomable> | null>(null);
  const [bar, setBar] = useState(true);
  const [toTop, setToTop] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pulled, setPulled] = useState(0);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  // Auto scroll: `auto` shows its controls, `paused` stops it there. It pauses itself at the end of the chapter.
  const [auto, setAuto] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(getScrollSpeed);
  const [tapScroll, setTapScrollOn] = useState(getTapScroll);
  // Read by the tap handler, which is set up once per chapter.
  const tapScrollRef = useRef(tapScroll);
  tapScrollRef.current = tapScroll;
  // The loading screen: 'on' until the pages that fill the first screen have shown, then 'out' while it fades, then gone.
  const [cover, setCover] = useState<'on' | 'out' | null>('on');
  const opened = useRef(performance.now());
  // Pages that showed or failed for good, by index; the rest are still loading.
  const [shown, setShown] = useState<Record<number, 'done' | 'failed'>>({});
  const mark = (i: number, st: 'done' | 'failed') => setShown((m) => ({ ...m, [i]: st }));
  // Where the bar was last shown, or the highest point scrolled to since; scrolling 30px down from there hides it.
  // Scrolling up leaves it hidden; a tap brings it back.
  const base = useRef(0);
  // Where this chapter was left, to open it there again once the pages down to that spot have loaded.
  const [resume, setResume] = useState(() => getSpot(x.id, n));
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
  useEffect(() => {
    if (!done || resume) return;
    const loading = pages.value.findIndex((_, i) => !shown[i]);
    const update = () => {
      const boxes = [...(pagesRef.current?.children ?? [])].map((e) => e.getBoundingClientRect());
      // The pages are already gone when the reader closes; there is nothing to measure then.
      if (!boxes.length) return;
      const p = readProgress(boxes, innerHeight, loading < 0 ? boxes.length : loading);
      setProgress(p);
      spot.current = p < 1 ? spotAt(boxes) : null;
      if (p < 1 || finished.current) return;
      finished.current = true;
      if (n > (findSeries(x.id)?.last || 0)) {
        setLast(x.id, n);
        toast(`Chapter ${fmt(n)} marked read`, true);
      }
    };
    update();
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, [done, shown, resume, x.id, n, toast]);

  // Auto scroll moves the pages on each frame, and waits while a finger is on the screen or the chapter list is open.
  useEffect(() => {
    if (!auto || paused || chaptersOpen || !done) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let held = false;
    const hold = (e: TouchEvent) => {
      held = e.touches.length > 0;
    };
    const frame = (t: number) => {
      if (!held) {
        const [px, rest] = scrollDistance(speed, t - last, carry);
        carry = rest;
        if (innerHeight + scrollY >= document.documentElement.scrollHeight - 1) return setPaused(true);
        if (px) scrollBy(0, px);
      }
      last = t;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    for (const ev of ['touchstart', 'touchend', 'touchcancel'] as const) addEventListener(ev, hold, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      for (const ev of ['touchstart', 'touchend', 'touchcancel'] as const) removeEventListener(ev, hold);
    };
  }, [auto, paused, chaptersOpen, done, speed]);

  // The loading screen lifts once every page that starts on the first screen has shown or failed, or the chapter
  // can't be shown (a message says why).
  const failed = chs?.status === 'error' || pages?.state === 'error' || (chs?.status === 'ready' && !readable);
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
  const allShown = done && pages.value.every((_, i) => shown[i] === 'done');

  // Once every page has shown, load the next chapter ahead so it opens at once. Never marks anything read.
  useEffect(() => {
    if (allShown) return preloadChapter(next);
  }, [allShown, next?.id]);

  // Pulling up at the end of the chapter opens the next one, as in webtoon apps: the pages rise by up to PULL px with
  // the ring that ends them filling, and a full ring opens the chapter. Only a finger pulls, so auto scroll stops at the end.
  // Only once every page has shown, so a short or loading chapter never skips ahead.
  const pullsOn = allShown && next && !next.ext ? next.num : undefined;
  useEffect(() => {
    if (pullsOn === undefined) return;
    let from: number | null = null;
    const atEnd = () => innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1 || (from === null && !atEnd())) {
        from = null;
        return setPulled(0);
      }
      const y = e.touches[0]!.clientY;
      from ??= y;
      const d = Math.min(PULL, Math.max(0, (from - y) / 2));
      setPulled(d);
      if (d < PULL) return;
      from = null;
      removeEventListener('touchmove', move);
      navigate({ name: 'reader', id: x.id, n: pullsOn }, true);
    };
    const release = () => {
      from = null;
      setPulled(0);
    };
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', release);
    addEventListener('touchcancel', release);
    return () => {
      removeEventListener('touchmove', move);
      removeEventListener('touchend', release);
      removeEventListener('touchcancel', release);
    };
  }, [pullsOn, x.id, navigate]);

  const toSeries = () => goBack({ name: 'series', id: x.id });
  const backToTop = () => {
    setBar(true);
    scrollTo({ top: 0, behavior: scrollMotion() });
  };
  const toChapter = (to: number) => navigate({ name: 'reader', id: x.id, n: to }, true);
  // Auto scroll and tap to scroll are never on together: turning one on turns the other off.
  const tapScrollTo = (on: boolean) => {
    setTapScrollOn(on);
    setTapScroll(on);
  };
  const toggleAuto = () => {
    if (!auto && tapScroll) {
      tapScrollTo(false);
      toast('Tap to scroll off');
    }
    setAuto(!auto);
    setPaused(false);
  };
  const toggleTapScroll = () => {
    if (!tapScroll) setAuto(false);
    tapScrollTo(!tapScroll);
    toast(tapScroll ? 'Tap to scroll off' : 'Tap to scroll on: tap the bottom of the screen to go down, the top to go back');
  };
  const changeSpeed = (d: number) => {
    const s = stepSpeed(speed, d);
    setSpeed(s);
    setScrollSpeed(s);
  };
  const zoomBy = (d: number) => {
    const z = zoom.current?.zoomBy(d);
    // Zooming scrolls to keep the middle in place; that is not the reader scrolling on.
    base.current = scrollY;
    if (z) toast(`Zoom ${Math.round(z * 100)}%`, true);
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
    content = (
      <>
        <div id="zwrap" ref={wrap}>
          <div id="pages" ref={pagesRef}>
            {pages.value.map((u, i) => (
              <div key={u.a} className={`pg ${shown[i] || ''}`}>
                <img
                  src={imageSrc(u.a)}
                  referrerPolicy="same-origin"
                  loading={resume && i <= resume.i ? 'eager' : 'lazy'}
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
        <div className="endbar">
          {prev && (
            <button className="btn ghost" onClick={() => toChapter(prev.num)}>
              ‹ Ch. {fmt(prev.num)}
            </button>
          )}
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
          {readable && <Credit c={readable} />}
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
              <button className="ibtn" aria-label="Auto scroll" aria-pressed={auto} onClick={toggleAuto}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 6l5 5 5-5M7 13l5 5 5-5" />
                </svg>
              </button>
              <button className="ibtn" aria-label="Tap to scroll" aria-pressed={tapScroll} onClick={toggleTapScroll}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v6M9 6l3-3 3 3M12 21v-6M9 18l3 3 3-3" />
                  <circle cx="12" cy="12" r="1.5" />
                </svg>
              </button>
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
      <div id="strip" className={pulled ? 'pulling' : undefined} style={pulled ? { transform: `translateY(${-pulled}px)` } : undefined}>
        {content}
        {pullsOn !== undefined && (
          <div className="pullnext" aria-hidden="true">
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" pathLength="1" />
              <circle className="ring" cx="18" cy="18" r="15" pathLength="1" style={{ strokeDashoffset: 1 - pulled / PULL }} />
              <path d="M18 11v14M12 19l6 6 6-6" />
            </svg>
            <span>Pull to read next chapter</span>
          </div>
        )}
      </div>
      {auto && done && (
        <div id="autoscroll" className="chnav" role="toolbar" aria-label="Auto scroll">
          <button aria-label={paused ? 'Play' : 'Pause'} onClick={() => setPaused(!paused)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={paused ? 'M8 5v14l11-7z' : 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'} />
            </svg>
          </button>
          <button aria-label="Slower" disabled={speed === SPEEDS[0]} onClick={() => changeSpeed(-1)}>
            −
          </button>
          <b aria-live="polite">{speed}×</b>
          <button aria-label="Faster" disabled={speed === SPEEDS.at(-1)} onClick={() => changeSpeed(1)}>
            +
          </button>
          <button aria-label="Stop auto scroll" onClick={toggleAuto}>
            ×
          </button>
        </div>
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

/**
 * The chapter's credit under the chapter switcher: its scanlation group and MangaDex, which MangaDex's API rules require.
 * A credit too long for the switcher scrolls right to left, or with reduced motion has its group name cut short.
 */
function Credit({ c }: { c: Chapter }) {
  const line = useRef<HTMLParagraphElement>(null);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => setLong(line.current!.scrollWidth > line.current!.clientWidth), []);
  const grp = c.grp || 'No group credited';
  const credit = (copy: boolean) => (
    <span aria-hidden={copy || undefined} style={long ? { animationDuration: `${(grp.length + 11) * 0.3}s` } : undefined}>
      <i>{grp}</i>&nbsp;· MangaDex
    </span>
  );
  // Two copies, each moved by its own width, so the loop starts again exactly where it began.
  return (
    <p ref={line} className={`chcredit${long ? ' long' : ''}`}>
      {credit(false)}
      {long && credit(true)}
    </p>
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
