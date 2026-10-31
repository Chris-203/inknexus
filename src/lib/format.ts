import type { Chapter } from './types';

/** Chapter number for display: 12 or 12.5. */
export function fmt(n: number): number {
  return Number.isInteger(n) ? n : +n.toFixed(1);
}

/** What a chapter row shows after its number: where it is read or its title, then its scanlation group. */
export function chapterNote(c: Pick<Chapter, 'ext' | 'title' | 'grp'>): string {
  return [c.ext ? 'Official site ↗' : c.title, c.grp].filter(Boolean).join(' · ');
}

/** A chapter's date for its row: 'Jan 16, 2026'. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** `n` and the word, plural unless n is 1: plural(3, 'chapter') is '3 chapters'. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A size in bytes for display, in whole KB up to 1000 KB, otherwise MB with one decimal under 10: '850 KB', '4.2 MB', '18 MB'. */
export function fileSize(bytes: number): string {
  // From 1000 KB on, so it never shows '1024 KB'.
  if (bytes < 1000 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / 1024 / 1024;
  return `${mb < 10 ? +mb.toFixed(1) : Math.round(mb)} MB`;
}

/** When `t` was, in whole calendar days before `now`: 'today', 'yesterday' or '5 days ago'. */
export function daysAgo(t: number, now = Date.now()): string {
  const day = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const d = Math.max(0, Math.round((day(now) - day(t)) / 864e5));
  return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${plural(d, 'day')} ago`;
}

/** Loose title match: lowercase letters and digits only. */
export function norm(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Whether `title` holds `q`, ignoring case, and ignoring spaces and punctuation too so "solo-leveling" finds "Solo Leveling". */
export function titleHas(title: string, q: string): boolean {
  const n = norm(q);
  return title.toLowerCase().includes(q.trim().toLowerCase()) || (!!n && norm(title).includes(n));
}
