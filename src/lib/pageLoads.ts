import { useRef, useState, type RefObject } from 'react';
import { useApp } from '../context';
import { imageSrc } from './api';
import type { Chapter, Page } from './types';
import * as mangadex from '../sources/mangadex';

/**
 * How the reader's pages of chapter `c` load, for the page images inside `pagesRef`: which have shown or failed for
 * good, by index, with what to do when an image loads or fails. A chapter read `fromDevice` (saved for offline) is
 * never asked of MangaDex again.
 */
export function usePageLoads(pagesRef: RefObject<HTMLDivElement | null>, c: Chapter | undefined, fromDevice: boolean) {
  const { toast } = useApp();
  // Pages that showed or failed for good, by index; the rest are still loading.
  const [shown, setShown] = useState<Record<number, 'done' | 'failed'>>({});
  const mark = (i: number, st: 'done' | 'failed') => setShown((m) => ({ ...m, [i]: st }));
  // The loaded pages' sizes added up. Pages still loading take their average shape (--pa), so the chapter's length
  // barely changes as pages load and the scroll bar does not jump back.
  const loaded = useRef({ w: 0, h: 0 });
  const failedOnce = useRef(false);
  // Asking MangaDex for a server again after the first failed page: whether it gave one, and its pages.
  const moved = useRef<Promise<boolean> | null>(null);
  const fresh = useRef<Page[] | null>(null);

  const onImgLoad = (img: HTMLImageElement, i: number) => {
    const t = loaded.current;
    t.w += img.naturalWidth;
    t.h += img.naturalHeight;
    pagesRef.current?.style.setProperty('--pa', `${t.w} / ${t.h}`);
    mark(i, 'done');
  };

  // The chapter's first failed page asks MangaDex for a server again, once (at-home allows 40 requests a minute), and moves
  // every page not loaded yet to it. A saved chapter loads from the device, so it is left as it is.
  const moveServer = async (id: string) => {
    try {
      const list = await mangadex.refreshPages(id);
      fresh.current = list;
      pagesRef.current?.querySelectorAll<HTMLImageElement>('.pg > img').forEach((img, k) => {
        if (img.naturalWidth || !list[k]) return;
        img.dataset.r = '1';
        img.src = imageSrc(list[k].a);
      });
      return true;
    } catch {
      return false;
    }
  };

  // Data-saver image first; on error try a new server, then full quality once, then mark the page failed and say so
  // once for this chapter.
  const onImgError = async (img: HTMLImageElement, i: number, u: Page) => {
    if (!fromDevice && c && !img.dataset.r) {
      moved.current ??= moveServer(c.id);
      // Moved to the new server: its own load or error follows.
      if (await moved.current) return;
    }
    const b = (fresh.current?.[i] ?? u).b;
    if (!img.dataset.t && b) {
      img.dataset.t = '1';
      img.src = imageSrc(b);
      return;
    }
    mark(i, 'failed');
    if (!failedOnce.current) {
      failedOnce.current = true;
      toast('Some pages failed to load. Try again later, or read this chapter on MangaDex.');
    }
  };

  return { shown, onImgLoad, onImgError };
}
