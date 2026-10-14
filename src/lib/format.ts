import type { Chapter } from './types';

/** Chapter number for display: 12 or 12.5. */
export function fmt(n: number): number {
  return Number.isInteger(n) ? n : +n.toFixed(1);
}

/** What a chapter row shows after its number: where it is read or its title, then its scanlation group. */
export function chapterNote(c: Pick<Chapter, 'ext' | 'title' | 'grp'>): string {
  return [c.ext ? 'Official site ↗' : c.title, c.grp].filter(Boolean).join(' · ');
}

/** `n` and the word, plural unless n is 1: plural(3, 'chapter') is '3 chapters'. */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Loose title match: lowercase letters and digits only. */
export function norm(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
