import { bestFits, fit, hintOf, webtoonNo } from './match';
import type { Series } from './types';

const s = (o: Partial<Series>): Series => ({ id: 'x', title: 'T', cover: '', md: null, al: null, links: [], last: 0, t: 0, ...o });
const wt = (path: string) => ({ label: 'Webtoon', url: `https://www.webtoons.com${path}` });

describe('webtoonNo', () => {
  it('reads the title number from series and episode links in either spelling', () => {
    expect(webtoonNo('https://www.webtoons.com/en/fantasy/rebirth/list?title_no=12')).toBe('12');
    expect(webtoonNo('https://m.webtoons.com/viewer?titleNo=34&episodeNo=2')).toBe('34');
  });
  it('is empty for other sites, missing or odd numbers, and text that is not a link', () => {
    expect(webtoonNo('https://example.com/list?title_no=12')).toBe('');
    expect(webtoonNo('https://www.webtoons.com/en/fantasy/rebirth/list')).toBe('');
    expect(webtoonNo('https://www.webtoons.com/list?title_no=12a')).toBe('');
    expect(webtoonNo('12345')).toBe('');
  });
});

describe('hintOf', () => {
  it('takes the title number and genre from the Webtoon link, and the AniList id', () => {
    expect(hintOf(s({ al: 7, links: [{ label: 'Site', url: 'https://example.com/' }, wt('/en/slice-of-life/a/list?title_no=5')] }))).toEqual({
      no: '5',
      genre: 'sliceoflife',
      al: 7,
    });
  });
  it("spells Webtoon's 'sf' as Sci-Fi, and has no genre for links that do not carry one", () => {
    expect(hintOf(s({ links: [wt('/en/sf/a/list?title_no=5')] }))?.genre).toBe('scifi');
    expect(hintOf(s({ links: [wt('/episodeList?titleNo=5')] }))).toEqual({ no: '5', genre: '', al: undefined });
  });
  it('is undefined without a Webtoon series link', () => {
    expect(hintOf(s({ links: [{ label: 'Site', url: 'https://example.com/' }] }))).toBeUndefined();
    expect(hintOf(s({ links: [wt('/en/fantasy/a/list')] }))).toBeUndefined();
  });
});

describe('fit', () => {
  const h = { no: '5', genre: 'fantasy', al: 7 };
  it('ranks the same Webtoon series over the AniList id, over the genre, over the long strip format', () => {
    const webtoon = fit(h, { urls: ['https://www.webtoons.com/en/x/a/list?title_no=5'], tags: [] });
    const al = fit(h, { urls: [], tags: ['Fantasy', 'Long Strip'], al: 7 });
    const genre = fit(h, { urls: [], tags: ['Fantasy'] });
    const strip = fit(h, { urls: [], tags: ['Long Strip'] });
    expect([webtoon > al, al > genre, genre > strip, strip > 0]).toEqual([true, true, true, true]);
  });
  it('is 0 without a hint, and gives nothing for another Webtoon series, AniList id or genre', () => {
    expect(fit(undefined, { urls: ['https://www.webtoons.com/list?title_no=5'], tags: ['Fantasy'], al: 7 })).toBe(0);
    expect(fit(h, { urls: ['https://www.webtoons.com/list?title_no=6', 'not a link'], tags: ['Romance'], al: 8 })).toBe(0);
    expect(fit({ no: '5', genre: '' }, { urls: [], tags: [], al: null })).toBe(0);
  });
});

describe('bestFits', () => {
  it('keeps every item with the top score, in order', () => {
    expect(bestFits([1, 3, 2, 3], (n) => n)).toEqual([3, 3]);
    expect(bestFits([], (n: number) => n)).toEqual([]);
  });
});
