import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useApp, type View } from '../context';
import { why } from '../lib/api';
import { useChapters } from '../lib/chapters';
import { fmt } from '../lib/links';
import { findSeries, setLast, useStore } from '../lib/store';
import type { Page } from '../lib/types';
import { zoomable } from '../lib/zoom';
import * as mangadex from '../sources/mangadex';

type ReaderView = Extract<View, { name: 'reader' }>;

/** The built-in reader, for MangaDex chapters only. It remounts for each chapter. */
export function Reader({ view }: { view: ReaderView }) {
  const { navigate, goBack, toast } = useApp();
  const { lib } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const chs = useChapters(x?.md);
  const list = chs?.status === 'ready' ? chs.list.chapters : [];
  const c = list.find((k) => k.num === view.n);
  const readable = c && !c.ext ? c : undefined;
  const [pages, setPages] = useState<{ state: 'busy' | 'error' | 'done'; error?: string; items: Page[] }>({ state: 'busy', items: [] });
  const wrap = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const failedOnce = useRef(false);

  useEffect(() => {
    if (!x?.md) navigate({ name: 'library' }, true);
  }, [x?.md, navigate]);

  useEffect(() => {
    if (!readable) return;
    let live = true;
    mangadex
      .pages(readable.id)
      .then((items) => live && setPages({ state: 'done', items }))
      .catch((e) => live && setPages({ state: 'error', error: why(e), items: [] }));
    return () => {
      live = false;
    };
  }, [readable?.id]);

  // Reaching the end of the chapter marks it read.
  useEffect(() => {
    if (pages.state !== 'done' || !end.current) return;
    const ob = new IntersectionObserver(
      (en) => {
        if (!en[0]?.isIntersecting) return;
        ob.disconnect();
        const s = findSeries(view.id);
        if (s && view.n > (s.last || 0)) {
          setLast(s.id, view.n);
          toast(`Chapter ${fmt(view.n)} marked read`);
        }
      },
      { threshold: 0.6 },
    );
    ob.observe(end.current);
    return () => ob.disconnect();
  }, [pages.state, view.id, view.n, toast]);

  useEffect(() => {
    if (pages.state !== 'done' || !wrap.current || !pagesRef.current) return;
    return zoomable(wrap.current, pagesRef.current);
  }, [pages.state]);

  if (!x?.md) return null;
  const prev = [...list].reverse().find((k) => k.num < view.n);
  const next = list.find((k) => k.num > view.n);
  const toSeries = () => goBack({ name: 'series', id: x.id });
  const toChapter = (n: number) => navigate({ name: 'reader', id: x.id, n }, true);

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
    content = <p className="hint">Chapter {fmt(view.n)} can't be read here. Go back and pick another chapter or source.</p>;
  else if (pages.state === 'error') content = <p className="hint">Could not load this chapter ({pages.error}). Try again, or switch to a different source.</p>;
  else if (!readable || pages.state === 'busy') content = <p className="hint">Loading pages…</p>;
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
            {pages.items.map((u) => (
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
      <div className="rbar">
        <button className="ibtn" aria-label="Back to series" onClick={toSeries}>
          ‹
        </button>
        <b>
          {x.title} · Ch. {fmt(view.n)}
        </b>
      </div>
      <div id="strip">{content}</div>
    </>
  );
}
