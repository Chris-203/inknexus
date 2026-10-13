import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../context';
import { TopBar } from '../components/TopBar';
import { useChapters } from '../lib/chapters';
import { fmt } from '../lib/format';
import { findSeries, setLast } from '../lib/store';
import type { Series } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { zoomable } from '../lib/zoom';
import * as mangadex from '../sources/mangadex';

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
  // Pages that showed or failed for good, by index; the rest are still loading.
  const [shown, setShown] = useState<Record<number, 'done' | 'failed'>>({});
  const mark = (i: number, st: 'done' | 'failed') => setShown((m) => ({ ...m, [i]: st }));
  // Where the bar was last shown or hidden; scrolling 30px down from there hides it, and 30px up shows it.
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
      const d = scrollY - base.current;
      if (Math.abs(d) > 30) {
        setBar(d < 0);
        base.current = scrollY;
      }
      setToTop(scrollY > innerHeight);
    };
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, []);

  const prev = [...list].reverse().find((k) => k.num < n);
  const next = list.find((k) => k.num > n);
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
                  src={u.a}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  alt={`Page ${i + 1}`}
                  onLoad={() => mark(i, 'done')}
                  onError={(e) => onImgError(e.currentTarget, i, u.b)}
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

  return (
    <>
      <TopBar off={!bar}>
        <button className="ibtn" aria-label="Back to series" onClick={toSeries}>
          ‹
        </button>
        <b>
          {x.title} · Ch. {fmt(n)}
        </b>
        {done && (
          <>
            <button className="ibtn" aria-label="Zoom out" onClick={() => zoomBy(-0.5)}>
              −
            </button>
            <button className="ibtn" aria-label="Zoom in" onClick={() => zoomBy(0.5)}>
              +
            </button>
          </>
        )}
      </TopBar>
      <div id="strip">{content}</div>
      {toTop && (
        <button id="totop" className="ibtn" aria-label="Back to top" onClick={backToTop}>
          ↑
        </button>
      )}
    </>
  );
}
