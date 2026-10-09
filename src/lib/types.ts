/** A link-only source: a site the user opens themselves. */
export interface Link {
  label: string;
  url: string;
  /** Chapter URL pattern with `{n}` where the chapter number goes, learned from a pasted link. */
  tpl?: string;
  /** The last chapter link the user pasted, so it can be reopened. */
  resume?: string;
  /** Chapter number of `resume`. */
  rn?: number;
  /** Hidden from the source chips. */
  h?: boolean;
}

/** One series in the library. Field names match what is already saved in people's browsers. */
export interface Series {
  id: string;
  title: string;
  cover: string;
  /** MangaDex manga id. */
  md: string | null;
  /** AniList media id. */
  al: number | string | null;
  /** MangaDex source hidden. */
  mdh?: boolean;
  /** Selected source: 'md' or 'l<index>'. */
  src?: string;
  links: Link[];
  /** Last chapter read. */
  last: number;
  /** Last touched, for library order. */
  t: number;
}

export interface State {
  lib: Series[];
  sort?: 'asc' | 'desc';
}

/** A search result from MangaDex ('md') or AniList ('al'). */
export interface SearchResult {
  src: 'md' | 'al';
  ref: string | number;
  title: string;
  desc: string;
  cover: string;
  links?: { label: string; url: string }[];
}

export interface Chapter {
  id: string;
  num: number;
  title: string;
  /** Official site URL when the chapter is hosted elsewhere. */
  ext: string;
  /** Scanlation group name(s), joined with ' & '. */
  grp: string;
}

export interface ChapterList {
  chapters: Chapter[];
  /** English chapters MangaDex returned, before dropping unreadable ones. */
  listed: number;
}

export interface Page {
  /** Data-saver image. */
  a: string;
  /** Full-quality fallback. */
  b: string;
}
