import { imageSrc } from './api';
import type { Chapter } from './types';
import { pages } from '../sources/mangadex';

/** The chapter after `n`. The list is sorted by number, so from 52 it is 52.5 when there is one, otherwise 53. */
export function nextChapter(list: Chapter[], n: number): Chapter | undefined {
  return list.find((k) => k.num > n);
}

/** True when the browser asks to save data or the connection is 2G. */
export function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c?.saveData || c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g';
}

/** Load one image into the browser cache; settles either way. */
function warm(src: string): Promise<void> {
  return new Promise((done) => {
    const img = new Image();
    img.referrerPolicy = 'same-origin';
    img.onload = img.onerror = () => done();
    img.src = src;
  });
}

/**
 * Load MangaDex chapter `c` ahead: its page list (one at-home request, reused when it opens) and its data-saver images,
 * two at a time, so it opens at once. Skips chapters hosted elsewhere and slow or data-saving connections.
 * Failures are left for the reader, which loads and reports those pages again when the chapter opens.
 * Returns a function that stops starting new images.
 */
export function preloadChapter(c: Chapter | undefined): () => void {
  let stopped = false;
  if (c && !c.ext && !saveData())
    pages(c.id).then(
      (list) => {
        const queue = list.map((p) => imageSrc(p.a));
        const step = () => {
          const src = queue.shift();
          if (src && !stopped) void warm(src).then(step);
        };
        step();
        step();
      },
      () => {},
    );
  return () => {
    stopped = true;
  };
}
