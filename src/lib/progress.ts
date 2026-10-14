/**
 * How far through the chapter's pages the reader is, from 0 to 1: the share of the pages above the bottom of the
 * screen. `top` and `height` are the pages' box on screen, `view` the screen's height. It reaches 1 at the last page's end.
 */
export function readProgress(top: number, height: number, view: number): number {
  if (height <= 0) return 0;
  return Math.min(1, Math.max(0, (view - top) / height));
}
