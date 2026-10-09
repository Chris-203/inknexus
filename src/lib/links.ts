import type { Link } from './types';

export interface ParsedChapterUrl {
  num: number;
  /** URL pattern with `{n}` for the chapter number; empty when the site puts an id before the number. */
  tpl: string;
  /** The series page, the link with the chapter part cut off. */
  series: string;
  idPrefixed: boolean;
}

/** True for http and https links only, so a saved or imported link can never be a javascript: URL. */
export function isWebUrl(u: string): boolean {
  try {
    return /^https?:$/.test(new URL(u).protocol);
  } catch {
    return false;
  }
}

/** Read the chapter number from a pasted chapter link, and learn the URL pattern where the site allows it. */
export function parseChUrl(u: string): ParsedChapterUrl | null {
  if (!isWebUrl(u)) return null;
  const o = new URL(u);
  const rest = u.slice(o.origin.length);
  const re = /(?:^|[\/\-_=])(?:chapter|chap|ch|episode|ep|c)[-_\/ .=]?(\d+)(?:[-_.](\d))?(?!\d)/gi;
  let m: RegExpExecArray | null;
  let hit: RegExpExecArray | null = null;
  while ((m = re.exec(rest))) hit = m;
  if (!hit) return null;
  const tail = hit[0].match(/\d+(?:[-_.]\d)?$/)![0];
  const start = hit.index + hit[0].length - tail.length;
  const cut = hit[0][0] === '/' ? hit.index : rest.lastIndexOf('/', hit.index);
  const seg = rest.slice(rest.lastIndexOf('/', hit.index + 1) + 1);
  const idPrefixed = /^\d{4,}-/.test(seg);
  return {
    num: parseFloat(hit[1] + (hit[2] ? '.' + hit[2] : '')),
    tpl: idPrefixed ? '' : o.origin + rest.slice(0, start) + '{n}' + rest.slice(start + tail.length),
    series: o.origin + rest.slice(0, Math.max(cut, 0)),
    idPrefixed,
  };
}

/** A link source from a pasted series or chapter link. Null when it is not an http(s) link. */
export function linkFrom(raw: string, label: string): { link: Link; r: ParsedChapterUrl | null } | null {
  const url = raw.trim();
  if (!isWebUrl(url)) return null;
  const r = parseChUrl(url);
  return { r, link: { label: label.trim(), url: r?.idPrefixed ? r.series : url, tpl: r?.tpl || '', resume: r ? url : '', rn: r?.num || 0 } };
}

export const host = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
};

/** Loose title match: lowercase letters and digits only. */
export const norm = (s: unknown): string => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Chapter number for display: 12 or 12.5. */
export const fmt = (n: number): number => (Number.isInteger(n) ? n : +n.toFixed(1));

/** The next whole chapter after `n`: 12 and 12.5 both give 13. */
export const nextWhole = (n: number): number => Math.floor(n) + 1;

/** One step from a chapter number with − / +: 12.5 goes up to 13 or down to 12. Never below 0. */
export const stepChapter = (n: number, d: 1 | -1): number => (d > 0 ? nextWhole(n) : Math.max(0, Math.ceil(n) - 1));

/**
 * Link-only sites: a name and the site's main address, prefilled so you only add the series path.
 * Sites move domains often; edit the address here when one changes.
 */
export const PRESETS: readonly (readonly [name: string, url: string])[] = [
  ['Asura Scans', 'https://asurascans.com/comics/'],
  ['Thunder Scans', 'https://en-thunderscans.com/'],
  ['Comix', 'https://comix.to/'],
  ['Toonily', 'https://toonily.com/'],
  ['Tapas', 'https://tapas.io/'],
  ['MANGA Plus', 'https://mangaplus.shueisha.co.jp/'],
];
