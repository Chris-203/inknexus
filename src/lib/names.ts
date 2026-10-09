export interface Name {
  /** MangaDex language code, e.g. 'en', 'ko-ro', 'ja'. */
  l: string;
  n: string;
}

interface Titled {
  title?: Record<string, string>;
  altTitles?: Record<string, string>[];
}

/** Every name MangaDex has for a series, English first, then romanized, then the rest. Duplicates removed. */
export function mdNames(a: Titled): Name[] {
  const out: Name[] = [];
  const seen = new Set<string>();
  const add = (l: string, n: string | undefined) => {
    const v = (n || '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push({ l, n: v });
    }
  };
  for (const [l, n] of Object.entries(a.title || {})) add(l, n);
  for (const t of a.altTitles || []) for (const [l, n] of Object.entries(t)) add(l, n);
  const rank = (l: string) => (l === 'en' ? 0 : /-ro$/.test(l) ? 1 : 2);
  return out.sort((p, q) => rank(p.l) - rank(q.l));
}

/** The name to show for a series: English when MangaDex has one. */
export const pickTitle = (a: Titled): string => mdNames(a)[0]?.n || 'Untitled';

/** 'ko-ro' -> 'Korean (romanized)', 'zh' -> 'Chinese'. Falls back to the code. */
export function langName(l: string): string {
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' });
    return /-ro$/.test(l) ? `${n.of(l.slice(0, -3))} (romanized)` : n.of(l) || l;
  } catch {
    return l;
  }
}
