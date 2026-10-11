import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useApp } from '../context';
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
    const z = zoomable(wrap.current, pagesRef.current, () => setBar((b) => !b));
    zoom.current = z;
    return z.stop;
  }, [done]);

  const prev = [...list].reverse().find((k) => k.num < n);
  const next = list.find((k) => k.num > n);
  const toSeries = () => goBack({ name: 'series', id: x.id });
  const toChapter = (to: number) => navigate({ name: 'reader', id: x.id, n: to }, true);
  const zoomBy = (d: number) => {
    const z = zoom.current?.zoomBy(d);
    if (z) toast(`Zoom ${Math.round(z * 100)}%`);
  };

  // Data-saver image first; on error try full quality once, then say so once for this chapter.
  const onImgError = (e: SyntheticEvent<HTMLImageElement>, b: string) => {
    const img = e.currentTarget;
    if (!img.dataset.t && b) {
      img.dataset.t = '1';
      img.src = b;
    } else if (!failedOnce.current) {
      failedOnce.current = true;
      toast('Some pages failed to load. Try another chapter or source.');
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
            {pages.value.map((u) => (
              <img key={u.a} src={u.a} referrerPolicy="no-referrer" loading="lazy" alt="Page failed to load" onError={(e) => onImgError(e, u.b)} />
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
      <div className={bar ? 'rbar' : 'rbar off'}>
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
      </div>
      <div id="strip">{content}</div>
    </>
  );
}
