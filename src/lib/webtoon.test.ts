import type { Series } from './types';
import { opensInBrowser } from './siteSettings';
import { getState, replaceState } from './store';
import {
  addMatches,
  bookmarklet,
  hasWebtoonList,
  importWebtoon,
  mergeWebtoon,
  openWebtoonInBrowser,
  parseWebtoonList,
  webtoonListIn,
  withMatches,
} from './webtoon';

const s = (o: Partial<Series>): Series => ({ id: 'x', title: 'T', cover: '', md: null, al: null, links: [], last: 0, t: 0, ...o });
const viewer = (no: number, ep: number, host = 'www') => `https://${host}.webtoons.com/en/fantasy/a-story/episode-${ep}/viewer?title_no=${no}&episode_no=${ep}`;

describe('parseWebtoonList', () => {
  it('turns episode links into the series page and the last episode', () => {
    expect(parseWebtoonList([[viewer(95, 12), 'A Story', 'A Story Ep. 12']])).toEqual([
      {
        title: 'A Story',
        url: 'https://www.webtoons.com/en/fantasy/a-story/list?title_no=95',
        resume: 'https://www.webtoons.com/en/fantasy/a-story/episode-12/viewer?title_no=95&episode_no=12',
        n: 12,
      },
    ]);
  });

  it('keeps one series per title at the furthest episode, in the order first seen, with the mobile site moved to www', () => {
    const list = parseWebtoonList([
      ['https://m.webtoons.com/en/fantasy/a-story/list?title_no=95', 'A Story', 'A Story'],
      [viewer(7, 3), 'Other', ''],
      [viewer(95, 40, 'm'), 'A Story', ''],
      [viewer(95, 20), 'A Story', ''],
    ]);
    expect(list.map((w) => [w.title, w.n])).toEqual([
      ['A Story', 40],
      ['Other', 3],
    ]);
    expect(list[0]!.resume).toBe(viewer(95, 40));
  });

  it('reads the short links on the Recent list, which have no series path', () => {
    const text = 'Placeholder Title Some Author #7, 2026-09-25 16:00 select';
    expect(parseWebtoonList([['https://m.webtoons.com/viewer?titleNo=6135&episodeNo=7', 'Placeholder Title', text]])).toEqual([
      {
        title: 'Placeholder Title',
        url: 'https://www.webtoons.com/episodeList?titleNo=6135',
        resume: 'https://www.webtoons.com/viewer?titleNo=6135&episodeNo=7',
        n: 7,
      },
    ]);
  });

  it('reads the episode from the link text when the link is to the series page', () => {
    const [w] = parseWebtoonList([['https://www.webtoons.com/en/romance/b/list?title_no=5', 'B', 'B Romance Ep. 33 Read']]);
    expect(w).toMatchObject({ n: 33, resume: '' });
  });

  it('leaves out series with no episode read, such as suggestions on the page', () => {
    expect(parseWebtoonList([['https://www.webtoons.com/en/romance/b/list?title_no=5', 'B', 'B Romance']])).toEqual([]);
  });

  it('drops links to other sites, other Webtoon pages, untitled series and anything that is not a link', () => {
    expect(
      parseWebtoonList([
        ['https://evil.example/en/x/y/list?title_no=1', 'Evil', ''],
        ['https://notwebtoons.com/en/x/y/list?title_no=1', 'Evil', ''],
        ['https://www.webtoons.com/en/x/y/rss?title_no=1', 'Feed', ''],
        ['https://www.webtoons.com/en/x/y/list?title_no=abc', 'Bad', ''],
        [viewer(2, 1), '', ''],
        'not a link',
        [42],
      ]),
    ).toEqual([]);
    expect(parseWebtoonList({ lib: [] })).toEqual([]);
  });
});

describe('webtoonListIn', () => {
  it('reads the list from a link the bookmarklet made, opened or pasted', () => {
    const link = 'https://app.example/#webtoon=' + encodeURIComponent(JSON.stringify([[viewer(9, 2), 'C', '']]));
    expect(hasWebtoonList(link)).toBe(true);
    expect(webtoonListIn(` ${link}\n`).map((w) => w.title)).toEqual(['C']);
  });

  it('throws when there is no list', () => {
    expect(hasWebtoonList('https://app.example/')).toBe(false);
    expect(() => webtoonListIn('hello')).toThrow();
    expect(() => webtoonListIn('#webtoon=%7Bbroken')).toThrow();
  });
});

describe('mergeWebtoon', () => {
  const w = (title: string, n: number) => ({ title, n, url: `https://www.webtoons.com/en/x/${title}/list?title_no=1`, resume: '' });

  it('adds new series as Webtoon link sources, keeping the list order', () => {
    const r = mergeWebtoon([], [w('First', 5), w('Second', 2)], 1000);
    expect(r.fresh).toHaveLength(2);
    expect(r.lib.map((x) => [x.title, x.last, x.t, x.links[0]!.label, x.links[0]!.rn])).toEqual([
      ['First', 5, 1000, 'Webtoon', 5],
      ['Second', 2, 999, 'Webtoon', 2],
    ]);
  });

  it('moves a series already in the library ahead only when the list is further along, updating its Webtoon link in place', () => {
    const site = { label: 'Site', url: 'https://example.com/' };
    const old = { label: 'Mine', url: 'https://www.webtoons.com/en/x/a/list?title_no=1', rn: 3 };
    const lib = [
      s({ id: 'a', title: 'Ahead', last: 10, links: [site, old] }),
      s({ id: 'b', title: 'Behind', last: 9, links: [old] }),
      s({ id: 'c', title: 'Plain', last: 1, md: 'm' }),
    ];
    const r = mergeWebtoon(lib, [w('Ahead', 20), w('Behind', 4), w('Plain', 1)], 1000);
    expect(r).toMatchObject({ fresh: [], updated: 2 });
    expect(r.lib[0]).toMatchObject({ last: 20, t: 1000, links: [site, { label: 'Mine', rn: 20, url: w('Ahead', 20).url }] });
    expect(r.lib[1]).toBe(lib[1]);
    // A series with no Webtoon link gains one, at the end so its other sources keep their places.
    expect(r.lib[2]).toMatchObject({ last: 1, t: 0, md: 'm', links: [{ label: 'Webtoon' }] });
  });

  it('gives Webtoon links the episode pattern, so Continue follows the chapter number', () => {
    const resume = 'https://www.webtoons.com/viewer?titleNo=1&episodeNo=5';
    const tpl = 'https://www.webtoons.com/viewer?titleNo=1&episodeNo={n}';
    expect(mergeWebtoon([], [{ ...w('New', 5), resume }]).lib[0]!.links[0]).toMatchObject({ tpl, resume, rn: 5 });
    // A link imported before links had a pattern gets it, even when the list is behind, and keeps its own episode.
    const old = { label: 'Webtoon', url: w('Old', 9).url, resume: 'https://www.webtoons.com/viewer?titleNo=1&episodeNo=9', rn: 9 };
    const r = mergeWebtoon([s({ title: 'Old', last: 9, links: [old] })], [{ ...w('Old', 5), resume }]);
    expect(r.updated).toBe(1);
    expect(r.lib[0]).toMatchObject({ last: 9, links: [{ ...old, tpl }] });
  });
});

describe('bookmarklet', () => {
  it('is one line of JavaScript that names the app it sends to', () => {
    const b = bookmarklet('https://app.example');
    expect(b.startsWith('javascript:')).toBe(true);
    expect(b).not.toMatch(/[\n#%]/);
    expect(b).toContain('"https://app.example"');
    expect(() => new Function(b.slice('javascript:'.length))).not.toThrow();
  });
});

describe('withMatches', () => {
  const wt = { label: 'Webtoon', url: 'https://www.webtoons.com/en/x/a/list?title_no=1' };
  const r = (src: 'md' | 'al', ref: string | number) => ({ src, ref, title: 'A', desc: '', cover: `https://c/${src}.jpg` });

  it('adds both sources, takes the AniList cover, and keeps the Webtoon link selected', () => {
    const x = withMatches(s({ links: [wt] }), r('al', 7), r('md', 'm1'));
    expect(x).toMatchObject({ al: 7, md: 'm1', cover: 'https://c/al.jpg', src: 'l0' });
  });

  it('keeps sources, a cover and a choice the series already has', () => {
    const mine = s({ al: 3, md: 'm0', cover: 'https://mine', src: 'md', links: [wt] });
    expect(withMatches(mine, r('al', 7), r('md', 'm1'))).toEqual(mine);
  });

  it('works with one match or none', () => {
    expect(withMatches(s({ links: [wt] }), null, r('md', 'm1'))).toMatchObject({ al: null, md: 'm1', cover: 'https://c/md.jpg', src: 'l0' });
    expect(withMatches(s({ links: [wt] }), null, null)).toEqual(s({ links: [wt] }));
  });
});

describe('addMatches', () => {
  const wt = (rn: number) => ({ label: 'Webtoon', url: 'https://www.webtoons.com/en/x/a/list?title_no=1', rn });
  const r = (src: 'md' | 'al', ref: string | number) => ({ src, ref, title: 'A', desc: '', cover: `https://c/${src}.jpg` });

  it('adds the matches to the series when no other series has them', () => {
    const lib = [s({ id: 'o', md: 'm0' }), s({ id: 'x', links: [wt(5)] })];
    const out = addMatches(lib, 'x', null, r('md', 'm1'));
    expect(out.merged).toBe(false);
    expect(out.lib).toEqual([lib[0], withMatches(lib[1]!, null, r('md', 'm1'))]);
  });

  it('merges into the series that already has the MangaDex match, updating its Webtoon link instead of adding another', () => {
    const site = { label: 'Site', url: 'https://example.com/' };
    const mine = s({ id: 'm', title: 'Jaeanggeum', md: 'm1', last: 3, src: 'md', links: [site, wt(3)] });
    const x = s({
      id: 'x',
      title: 'The Return',
      al: 7,
      last: 9,
      t: 50,
      links: [{ ...wt(9), resume: 'https://www.webtoons.com/viewer?titleNo=1&episodeNo=9' }],
    });
    const out = addMatches([mine, x], 'x', null, r('md', 'm1'));
    expect(out.merged).toBe(true);
    expect(out.lib).toHaveLength(1);
    expect(out.lib[0]).toMatchObject({ id: 'm', title: 'Jaeanggeum', md: 'm1', al: 7, last: 9, t: 50, src: 'md' });
    expect(out.lib[0]!.links).toEqual([site, x.links[0]]);
  });

  it('merges by the AniList match too, and gives a series with no Webtoon link one, keeping its place and progress when ahead', () => {
    const mine = s({ id: 'm', al: 7, md: 'm0', last: 20 });
    const x = s({ id: 'x', last: 9, links: [wt(9)] });
    const out = addMatches([x, mine], 'x', r('al', 7), null);
    expect(out).toMatchObject({ merged: true, lib: [{ id: 'm', al: 7, md: 'm0', last: 20, links: [wt(9)] }] });
  });

  it('leaves the library as it is when the series is gone', () => {
    const lib = [s({ id: 'o' })];
    expect(addMatches(lib, 'x', r('al', 7), null)).toEqual({ lib, merged: false });
  });
});

describe('importWebtoon', () => {
  const link = (...titles: string[]) => 'https://app.example/#webtoon=' + encodeURIComponent(JSON.stringify(titles.map((t, i) => [viewer(i + 1, 5), t, ''])));
  // AniList knows only 'Known'; MangaDex answers with `md` or fails with `status`.
  const stub = (md: unknown, status = 200) =>
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      if (!u.includes('anilist')) return new Response(JSON.stringify(md), { status });
      const vars: Record<string, string> = JSON.parse(String(init!.body)).variables;
      const data = Object.fromEntries(
        Object.entries(vars).map(([k, q]) => ['m' + k.slice(1), { media: q === 'Known' ? [{ id: 9, title: { english: q } }] : [] }]),
      );
      return new Response(JSON.stringify({ data }));
    });
  const run = async (text: string) => {
    const said: string[] = [];
    importWebtoon(text, (m) => said.push(m));
    if (said[0]!.includes('Looking up')) await vi.waitFor(() => expect(said).toHaveLength(2));
    return said;
  };

  beforeEach(() => replaceState({ lib: [] }));
  afterEach(() => vi.unstubAllGlobals());

  it('adds the series, then the exact matches as sources with the Webtoon link still selected', async () => {
    stub({ data: [{ id: 'm1', attributes: { title: { en: 'Other' } } }] });
    const said = await run(link('Known', 'Other', 'Unknown'));
    expect(said).toEqual(['Webtoon list imported: 3 added. Looking up covers on AniList and MangaDex…', 'Found 2 of 3 Webtoon series on AniList or MangaDex']);
    expect(getState().lib.map((x) => [x.title, x.al, x.md, x.src])).toEqual([
      ['Known', 9, null, undefined],
      ['Other', null, 'm1', 'l0'],
      ['Unknown', null, null, undefined],
    ]);
  });

  it('merges a series already in the library under another name into it, with one Webtoon link', async () => {
    stub({ data: [{ id: 'm1', attributes: { title: { 'ko-ro': 'Jaeanggeum' }, altTitles: [{ en: 'The Return' }] } }] });
    replaceState({ lib: [s({ id: 'mine', title: 'Jaeanggeum', md: 'm1', last: 2, src: 'md' })] });
    const said = await run(link('The Return'));
    expect(said[1]).toBe('Found 1 of 1 Webtoon series on AniList or MangaDex, 1 already in My Series');
    expect(getState().lib).toHaveLength(1);
    expect(getState().lib[0]).toMatchObject({ id: 'mine', title: 'Jaeanggeum', last: 5, src: 'md' });
    expect(getState().lib[0]!.links.map((l) => l.label)).toEqual(['Webtoon']);
  });

  it('keeps the AniList matches and says what failed when MangaDex fails', async () => {
    stub({}, 429);
    const said = await run(link('Known'));
    expect(said[1]).toMatch(/^Stopped looking up series on AniList and MangaDex \(HTTP 429: .*\)\. 1 matched/);
    expect(getState().lib[0]).toMatchObject({ al: 9, md: null });
  });

  it('says when there is no list, and looks nothing up when nothing was added', async () => {
    expect(await run('hello')).toEqual(['No Webtoon list found. On webtoons.com, tap the bookmark, then Send to InkNexus']);
    const wt = { label: 'Webtoon', url: 'https://www.webtoons.com/en/x/k/list?title_no=1', tpl: 'https://www.webtoons.com/viewer?titleNo=1&episodeNo={n}' };
    replaceState({ lib: [s({ title: 'Known', last: 9, links: [wt] })] });
    expect(await run(link('Known'))).toEqual(['Webtoon list imported. Nothing changed']);
  });
});

describe('openWebtoonInBrowser', () => {
  beforeEach(() => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('turns on Open in the browser for each Webtoon site among the links, and leaves other sites alone', () => {
    openWebtoonInBrowser([
      { label: 'Webtoon', url: 'https://www.webtoons.com/en/x/a/list?title_no=1' },
      { label: 'Webtoon', url: 'https://m.webtoons.com/viewer?titleNo=2&episodeNo=3' },
      { label: 'Site', url: 'https://example.com/' },
    ]);
    expect(['webtoons.com', 'm.webtoons.com', 'example.com'].map(opensInBrowser)).toEqual([true, true, false]);
  });
});
