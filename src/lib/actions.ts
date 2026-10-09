import { fmt, parseChUrl } from './links';
import { findSeries, updateSeries } from './store';

/**
 * Read a chapter link from the clipboard (or a prompt), set the chapter number from it,
 * and teach link source `i` the URL pattern. Returns false when no chapter number was found.
 */
export async function pasteChapterLink(seriesId: string, i: number, toast: (m: string) => void): Promise<boolean> {
  let t = '';
  try {
    t = await navigator.clipboard.readText();
  } catch {
    t = prompt('Paste the chapter link') || '';
  }
  const raw = t.trim();
  const r = parseChUrl(raw);
  if (!r) {
    toast('No chapter number found. Copy a chapter link first.');
    return false;
  }
  updateSeries(
    seriesId,
    (x) => ({
      last: r.num,
      links: x.links.map((l, k) => (k === i ? { ...l, tpl: r.tpl, resume: raw, rn: r.num, ...(r.idPrefixed ? { url: r.series } : {}) } : l)),
    }),
    true,
  );
  toast(`Now on chapter ${fmt(r.num)}`);
  return !!findSeries(seriesId);
}
