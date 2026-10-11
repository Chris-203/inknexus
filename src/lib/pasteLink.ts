import { fmt } from './format';
import { parseChUrl } from './links';
import { setLast, updateSeries } from './store';

/** Read a chapter link from the clipboard (or a prompt), set the chapter from it, and teach link source `i` its URL pattern. */
export async function pasteChapterLink(seriesId: string, i: number, toast: (m: string) => void) {
  let t = '';
  try {
    t = await navigator.clipboard.readText();
  } catch {
    t = prompt('Paste the chapter link') || '';
  }
  t = t.trim();
  const r = parseChUrl(t);
  if (!r) return toast('No chapter number found. Copy a chapter link first.');
  updateSeries(seriesId, (x) => ({
    links: x.links.map((l, k) => (k === i ? { ...l, tpl: r.tpl, resume: t, rn: r.num, ...(r.idPrefixed ? { url: r.series } : {}) } : l)),
  }));
  setLast(seriesId, r.num);
  toast(`Now on chapter ${fmt(r.num)}`);
}
