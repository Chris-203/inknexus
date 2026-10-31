import { getState, joined, lookFrom, mergeSeries, moveLink, removeSeries, replaceState, setShelf, shownSource, sourceFrom } from './store';
import type { Series } from './types';

function series(id: string): Series {
  return { id, title: id, cover: '', md: null, al: null, links: [], last: 0, t: 0 };
}

beforeEach(() => replaceState({ lib: ['a', 'b', 'c'].map(series) }));

describe('removeSeries', () => {
  it('removes one series', () => {
    removeSeries('b');
    expect(getState().lib.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('removes several at once and keeps the rest in order', () => {
    removeSeries('c', 'a');
    expect(getState().lib.map((x) => x.id)).toEqual(['b']);
  });
  it('ignores ids that are not in the library', () => {
    removeSeries('z');
    expect(getState().lib.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('setShelf', () => {
  it('moves the given series and leaves the rest', () => {
    setShelf(['a', 'c'], 'done');
    expect(getState().lib.map((x) => x.shelf)).toEqual(['done', undefined, 'done']);
  });
  it('saves Reading as no shelf, so the saved library keeps its old shape', () => {
    setShelf(['a'], 'drop');
    setShelf(['a'], 'reading');
    expect(JSON.stringify(getState().lib[0])).not.toContain('shelf');
  });
});

describe('shownSource', () => {
  const link = (h = false) => ({ label: 'Site', url: 'https://example.com', h });
  it('is the chosen source while it is visible', () => {
    expect(shownSource({ ...series('a'), md: 'm', links: [link()], src: 'l0' })).toBe('l0');
  });
  it('falls back to the first visible source when the chosen one is hidden, missing or unset', () => {
    expect(shownSource({ ...series('a'), md: 'm', mdh: true, links: [link(true), link()], src: 'md' })).toBe('l1');
    expect(shownSource({ ...series('a'), md: 'm', links: [], src: 'l3' })).toBe('md');
    expect(shownSource({ ...series('a'), links: [link()] })).toBe('l0');
  });
  it('is empty when every source is hidden or there are none', () => {
    expect(shownSource({ ...series('a'), md: 'm', mdh: true, links: [link(true)] })).toBe('');
    expect(shownSource(series('a'))).toBe('');
  });
});

describe('sourceFrom', () => {
  const o = { ref: 'm1', title: 'T', desc: '', cover: 'https://c/1.jpg' };
  it('adds a MangaDex id, shown, with its cover only when the series has none', () => {
    expect(sourceFrom({ ...series('a'), mdh: true }, { ...o, src: 'md' })).toEqual({ md: 'm1', mdh: false, cover: 'https://c/1.jpg' });
    expect(sourceFrom({ ...series('a'), cover: 'https://mine' }, { ...o, src: 'md' }).cover).toBe('https://mine');
  });
  it('adds an AniList id and only the official links the series lacks', () => {
    const l = { label: 'Site', url: 'https://example.com' };
    const r = sourceFrom({ ...series('a'), links: [l] }, { ...o, src: 'al', ref: 7, links: [l, { label: 'Other', url: 'https://other.example' }] });
    expect(r).toEqual({ al: 7, cover: 'https://c/1.jpg', links: [l, { label: 'Other', url: 'https://other.example' }] });
  });
  it('takes the new cover when it replaces the match the cover came from, and keeps any other cover', () => {
    const md = { ...series('a'), md: 'm0', cover: 'https://uploads.mangadex.org/covers/m0/c.jpg' };
    expect(sourceFrom(md, { ...o, src: 'md' }).cover).toBe('https://c/1.jpg');
    expect(sourceFrom({ ...md, al: 3 }, { ...o, src: 'al', ref: 7 }).cover).toBe(md.cover);
    const al = { ...series('a'), al: 3, cover: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx3.jpg' };
    expect(sourceFrom(al, { ...o, src: 'al', ref: 7 }).cover).toBe('https://c/1.jpg');
    expect(sourceFrom(al, { ...o, src: 'md' }).cover).toBe(al.cover);
    expect(sourceFrom(md, { ...o, src: 'md', cover: '' }).cover).toBe(md.cover);
  });
});

describe('lookFrom', () => {
  const o = { src: 'md' as const, ref: 'm1', title: 'Theirs', desc: '', cover: 'https://c/1.jpg' };
  it("takes the match's cover and name, keeping the series' cover when the match has none", () => {
    expect(lookFrom({ ...series('a'), cover: 'https://mine' }, o, true)).toEqual({ cover: 'https://c/1.jpg', title: 'Theirs' });
    expect(lookFrom({ ...series('a'), cover: 'https://mine' }, { ...o, cover: '' }, true)).toEqual({ cover: 'https://mine', title: 'Theirs' });
  });
  it("keeps the series' cover and name, taking the match's cover only when the series has none", () => {
    expect(lookFrom({ ...series('a'), cover: 'https://mine' }, o, false)).toEqual({ cover: 'https://mine', title: 'a' });
    expect(lookFrom(series('a'), o, false)).toEqual({ cover: 'https://c/1.jpg', title: 'a' });
  });
});

describe('joined', () => {
  const l = (url: string) => ({ label: 'Site', url });
  it('adds the links, matches, cover and further chapter the series lacks, keeping its own name, shelf and choice', () => {
    const into: Series = { ...series('a'), shelf: 'plan', src: 'l0', md: 'm1', links: [l('https://a.example/')], last: 3, t: 5 };
    const x: Series = {
      ...series('b'),
      md: 'm2',
      mdh: true,
      al: 7,
      cover: 'https://c',
      links: [l('https://a.example/'), l('https://b.example/')],
      last: 9,
      t: 2,
    };
    expect(joined(into, x)).toEqual({
      ...into,
      al: 7,
      info: undefined,
      cover: 'https://c',
      links: [l('https://a.example/'), l('https://b.example/')],
      last: 9,
      t: 5,
    });
  });
  it('takes the MangaDex match with whether it is hidden, and the AniList ranking with its id', () => {
    const info = { al: 7, at: 1, score: 80, lists: 5, ranks: [] };
    expect(joined(series('a'), { ...series('b'), md: 'm2', mdh: true, al: 7, info })).toMatchObject({ md: 'm2', mdh: true, al: 7, info });
  });
});

describe('mergeSeries', () => {
  it('joins the series into the other one and removes it', () => {
    replaceState({ lib: [{ ...series('a'), md: 'm1', last: 4 }, series('b')] });
    mergeSeries('a', 'b');
    expect(getState().lib).toEqual([{ ...series('b'), md: 'm1', mdh: undefined, al: null, info: undefined, last: 4 }]);
  });
  it('does nothing when the series is gone', () => {
    const before = getState();
    mergeSeries('z', 'a');
    expect(getState()).toBe(before);
  });
});

describe('moveLink', () => {
  const wt = { label: 'Webtoon', url: 'https://www.webtoons.com/en/x/a/list?title_no=1', rn: 12 };
  const other = { label: 'Site', url: 'https://example.com/' };
  beforeEach(() =>
    replaceState({
      lib: [
        { ...series('a'), md: 'm1', links: [wt, other], src: 'l1', last: 30 },
        { ...series('b'), last: 2 },
      ],
    }),
  );

  it('moves the link with its chapter into another series, and the series it left chooses its source again', () => {
    expect(moveLink('a', 0, 'b', 'ignored')).toBe('b');
    const [a, b] = getState().lib;
    expect(a).toMatchObject({ md: 'm1', links: [other], src: '', last: 30 });
    expect(b).toMatchObject({ links: [wt], last: 12 });
  });
  it('keeps MangaDex chosen in the series it left', () => {
    replaceState({ lib: [{ ...series('a'), md: 'm1', links: [wt], src: 'md' }] });
    moveLink('a', 0, 'b', 'x');
    expect(getState().lib[0]!.src).toBe('md');
  });
  it('makes a new series with the name, the link and its chapter', () => {
    const id = moveLink('a', 0, null, 'Rebirth');
    const lib = getState().lib;
    expect(lib).toHaveLength(3);
    expect(lib[2]).toMatchObject({ id, title: 'Rebirth', md: null, al: null, links: [wt], last: 12 });
  });
});
