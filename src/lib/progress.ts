/**
 * How far through the chapter the reader is, from 0 to 1, counted in pages: the pages above the bottom of the
 * screen, plus the share of the page that is crossing it. `pages` are the pages' boxes on screen, `view` the
 * screen's height, `ready` how many pages from the first have loaded. It stops at the first page still loading,
 * whose height is not known yet, so it never runs ahead and then jumps back once that page loads.
 * It reaches 1 at the last page's end.
 */
export function readProgress(pages: { top: number; bottom: number }[], view: number, ready = pages.length): number {
  const i = pages.findIndex((p) => p.bottom > view);
  const p = pages[i];
  const at = p ? i + Math.min(1, Math.max(0, (view - p.top) / (p.bottom - p.top))) : pages.length;
  return pages.length ? Math.min(at, ready) / pages.length : 0;
}
