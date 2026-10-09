import { useEffect, useRef, useState } from 'react';
import { useApp, type View } from '../context';
import { useChapters } from '../lib/chapters';
import { fmt } from '../lib/links';
import { why } from '../lib/api';
import { findSeries, setLast, useStore } from '../lib/store';
import type { Page } from '../lib/types';
import { zoomable } from '../lib/zoom';
import * as mangadex from '../sources/mangadex';

type ReaderView = Extract<View, { name: 'reader' }>;

export function Reader({ view }: { view: ReaderView }) {
  const { navigate, toast } = useApp();
  const { lib } = useStore();
  const x = lib.find((s) => s.id === view.id);
  const [chs] = useChapters(x?.md);
  const list = chs?.status === 'ready' ? chs.list.chapters : [];
  const c = list.find((k) => k.num === view.n);
  const [pages, setPages] = useState<{ state: 'busy' | 'error' | 'done'; error?: string; items: Page[] }>({ state: 'busy', items: [] });
  const wrap = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const failedOnce = useRef(false);

  useEffect(() => {
    if (!x) navigate({ name: 'library' }, true);
  }, [x, navigate]);

  useEffect(() => {
    if (!c) return;
    let live = true;
    mangadex
      .pages(c.id)
      .then((items) => live && setPages({ state: 'done', items }))
      .catch((e) => live && setPages({ state: 'error', error: why(e), items: [] }));
    return () => {
      live = false;
    };
  }, [c?.id]);

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

  if (!x) return null;
  const prev = [...list].reverse().find((k) => k.num < view.n);
  const next = list.find((k) => k.num > view.n);
  const toSeries = () => navigate({ name: 'series', id: x.id, src: 'md' });
  const toChapter = (n: number) => navigate({ name: 'reader', id: x.id, n }, true);

  const credit = c && (
    <p className="credit">
      {c.grp ? `Scanlation by ${c.grp}` : 'No scanlation group credited'} · via MangaDex.{' '}
      <a href={mangadex.chapterUrl(c.id)} target="_blank" rel="noopener noreferrer">
        Read on MangaDex ↗
      </a>
    </p>
  );

  // Data-saver image first; on error try full quality once, then say so.
  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>, b: string) => {
    const img = e.currentTarget;
    if (!img.dataset.t && b) {
      img.dataset.t = '1';
      img.src = b;
    } else if (!failedOnce.current) {
      failedOnce.current = true;
      toast('Some pages failed to load. Try another chapter or source.');
    }
  };

  let content: React.ReactNode;
  if (chs?.status === 'error') content = <p className="hint">Could not load this chapter ({chs.error}). Try again, or switch to a different source.</p>;
  else if (!c && chs?.status === 'ready') content = <p className="hint">Chapter {fmt(view.n)} is not on MangaDex. Go back and pick another chapter or source.</p>;
  else if (pages.state === 'error') content = <p className="hint">Could not load this chapter ({pages.error}). Try again, or switch to a different source.</p>;
  else if (pages.state === 'busy') content = <p className="hint">Loading pages…</p>;
  else
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
        <div id="end" className="endbar" ref={end}>
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

  return (
    <>
      <div className="rbar">
        <button aria-label="Back to series" onClick={toSeries}>
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
