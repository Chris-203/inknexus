import type { Series } from './types';
import { bookmarklet, hasWebtoonList, mergeWebtoon, parseWebtoonList, webtoonListIn } from './webtoon';

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
    expect(r.added).toBe(2);
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
    expect(r).toMatchObject({ added: 0, updated: 2 });
    expect(r.lib[0]).toMatchObject({ last: 20, t: 1000, links: [site, { label: 'Mine', rn: 20, url: w('Ahead', 20).url }] });
    expect(r.lib[1]).toBe(lib[1]);
    // A series with no Webtoon link gains one, at the end so its other sources keep their places.
    expect(r.lib[2]).toMatchObject({ last: 1, t: 0, md: 'm', links: [{ label: 'Webtoon' }] });
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
