import { mangaUrl } from '../sources/mangadex';
import { why } from './api';
import { shownSource } from './store';
import type { Series } from './types';

/** The page to share for a series: MangaDex's title page or the link source's page, whichever it shows, or none when every source is hidden. */
export function shareUrl(x: Series): string | undefined {
  const k = shownSource(x);
  if (k === 'md') return mangaUrl(x.md!);
  return k ? x.links[Number(k.slice(1))]?.url : undefined;
}

/** Share a series' title and page through the share sheet, or copy them where the browser has none. */
export async function shareSeries(x: Series, toast: (message: string) => void) {
  const url = shareUrl(x);
  if (navigator.share) {
    try {
      await navigator.share({ title: x.title, url });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast(`Could not share (${why(e)}). Tap Share again`);
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url ? `${x.title} ${url}` : x.title);
    toast(url ? 'Copied the link' : 'Copied the title');
  } catch {
    toast('Could not copy. Allow clipboard access for InkNexus, then tap Share again');
  }
}
