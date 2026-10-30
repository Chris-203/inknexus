import {
  addDetails,
  alMatch,
  alNames,
  details,
  info,
  likeThis,
  matchTitles,
  ranking,
  search,
  toDetails,
  toLikeThis,
  toRanking,
  toTrailer,
  trailer,
  trending,
  type AlMedia,
} from './anilist';

afterEach(() => vi.unstubAllGlobals());

/** Answer AniList with `data`, keeping each request's variables. */
const answer = (data: unknown, status = 200) => {
  const sent: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).variables);
    return new Response(JSON.stringify({ data }), { status });
  });
  return sent;
};

describe('toDetails', () => {
  it('lists genres, then well-ranked tags that are not spoilers, and the story and art staff once', () => {
    const d = toDetails({
      genres: ['Action', 'Fantasy'],
      tags: [
        { name: 'Dungeon', rank: 90, isMediaSpoiler: false },
        { name: 'Twist', rank: 95, isMediaSpoiler: true },
        { name: 'Cooking', rank: 40, isMediaSpoiler: false },
      ],
      status: 'FINISHED',
      chapters: 120,
      startDate: { year: 2018 },
      averageScore: 84,
      staff: {
        edges: [
          { role: 'Story & Art', node: { name: { full: 'Pen Name' } } },
          { role: 'Story', node: { name: { full: 'Pen Name' } } },
          { role: 'Translator', node: { name: { full: 'Someone Else' } } },
        ],
      },
    });
    expect(d).toEqual({ tags: ['Action', 'Fantasy', 'Dungeon'], status: 'Completed', year: 2018, chapters: 120, authors: ['Pen Name'], score: 84 });
  });
  it('gives null for an ongoing series with no chapter count and an empty status when it is missing', () => {
    expect(toDetails({ status: null, chapters: null })).toEqual({ tags: [], status: '', year: null, chapters: null, authors: [], score: null });
  });
});

describe('addDetails', () => {
  it("adds AniList's score and the tags MangaDex does not have, keeping the rest from MangaDex", () => {
    const md = { tags: ['Action', 'Time Travel'], status: 'Ongoing', year: 2020, chapters: 50, authors: ['Pen Name'] };
    const al = { tags: ['Action', 'Drama', 'time-travel', 'Revenge'], status: 'Completed', year: 2019, chapters: 99, authors: ['Other'], score: 77 };
    expect(addDetails(md, al)).toEqual({ ...md, tags: ['Action', 'Time Travel', 'Drama', 'Revenge'], score: 77 });
  });
});

describe('toRanking', () => {
  it('lists all-time places first, and adds the year to a year place', () => {
    const r = toRanking({
      averageScore: 84,
      popularity: 120345,
      rankings: [
        { rank: 3, context: 'highest rated', allTime: false, year: 2019 },
        { rank: 12, context: 'most popular all time', allTime: true, year: null },
      ],
    });
    expect(r).toEqual({ score: 84, lists: 120345, ranks: ['#12 Most popular all time', '#3 Highest rated of 2019'] });
  });
  it('gives no score, no lists and no ranks for a series AniList has not ranked', () => {
    expect(toRanking({ averageScore: null, popularity: null, rankings: [] })).toEqual({ score: null, lists: 0, ranks: [] });
    expect(toRanking({ rankings: [{ rank: 5, context: 'most popular', allTime: false, year: null }] }).ranks).toEqual(['#5 Most popular']);
  });
});

describe('toTrailer', () => {
  const anime = (id: string, site = 'youtube', relationType = 'ADAPTATION', type = 'ANIME') => ({
    relationType,
    node: { type, title: { romaji: 'Anime ' + id }, trailer: { id, site } },
  });
  it("takes the series' own trailer before its anime adaptation's", () => {
    expect(
      toTrailer({ title: { english: 'The Series', romaji: 'Sakuhin' }, trailer: { id: 'own', site: 'youtube' }, relations: { edges: [anime('adapted')] } }),
    ).toEqual({
      title: 'The Series',
      site: 'YouTube',
      embed: 'https://www.youtube-nocookie.com/embed/own?playsinline=1',
      page: 'https://www.youtube.com/watch?v=own',
    });
    expect(toTrailer({ trailer: null, relations: { edges: [anime('x7k', 'dailymotion')] } })).toEqual({
      title: 'Anime x7k',
      site: 'Dailymotion',
      embed: 'https://www.dailymotion.com/embed/video/x7k',
      page: 'https://www.dailymotion.com/video/x7k',
    });
  });
  it('skips other relations, sites it does not know and adaptations without a trailer', () => {
    const edges = [
      anime('seq', 'youtube', 'SEQUEL'),
      anime('film', 'youtube', 'ADAPTATION', 'MANGA'),
      anime('v', 'vimeo'),
      { relationType: 'ADAPTATION', node: { type: 'ANIME', trailer: null } },
    ];
    expect(toTrailer({ relations: { edges } })).toBeNull();
    expect(toTrailer({})).toBeNull();
  });
  it('escapes the id and gives an empty title when AniList has none', () => {
    expect(toTrailer({ trailer: { id: 'a&b/c', site: 'youtube' } })).toMatchObject({ title: '', page: 'https://www.youtube.com/watch?v=a%26b%2Fc' });
  });
});

describe('AniList requests', () => {
  it('info asks for every id at once and gives each score and plain synopsis by id', async () => {
    const sent = answer({
      Page: {
        media: [
          { id: 1, averageScore: 84, description: 'A <i>hero</i><br>returns.' },
          { id: 2, averageScore: null, description: null },
        ],
      },
    });
    const got = await info([1, 2, 3]);
    expect(sent).toEqual([{ ids: [1, 2, 3] }]);
    expect([...got]).toEqual([
      [1, { score: 84, desc: 'A heroreturns.' }],
      [2, { score: null, desc: '' }],
    ]);
  });
  it('trending gives the list AniList sends and says when it sends none', async () => {
    answer({ Page: { media: [{ id: 1, title: { romaji: 'A' } }] } });
    expect(await trending()).toEqual([{ id: 1, title: { romaji: 'A' } }]);
    answer({ Page: {} });
    await expect(trending()).rejects.toThrow('unexpected answer');
  });
  it('info says when AniList sends no list', async () => {
    answer({});
    await expect(info([1])).rejects.toThrow('unexpected answer');
  });
  it('ranking asks by id and says when the series is gone', async () => {
    const sent = answer({ Media: null });
    await expect(ranking(9)).rejects.toThrow('AniList no longer has this series');
    expect(sent).toEqual([{ id: 9 }]);
  });
  it('details asks by id and says when the series is gone', async () => {
    const sent = answer({ Media: null });
    await expect(details(7)).rejects.toThrow('AniList no longer has this series');
    expect(sent).toEqual([{ id: 7 }]);
  });
  it('trailer asks by id and is empty when AniList no longer has the series', async () => {
    const sent = answer({ Media: null });
    expect(await trailer(7)).toBeNull();
    expect(sent).toEqual([{ id: 7 }]);
  });
  it('search still says what failed on a rate limit', async () => {
    answer(null, 429);
    await expect(search('x')).rejects.toThrow('HTTP 429: AniList is rate-limiting');
  });
});

describe('alNames', () => {
  it('lists the English and romaji titles, then the synonyms, leaving out missing ones', () => {
    expect(alNames({ id: 1, title: { english: null, romaji: 'Roma' }, synonyms: ['Syn'] })).toEqual(['Roma', 'Syn']);
    expect(alNames({ id: 1, title: { english: 'Eng' } })).toEqual(['Eng']);
  });
});

describe('alMatch', () => {
  const m = (id: number, english: string | null, romaji = '', synonyms: string[] = []): AlMedia => ({ id, title: { english, romaji }, synonyms });
  it('takes the series whose English or romaji title or a synonym is the title, comparing letters and digits only', () => {
    expect(alMatch('The Hero!', [m(1, 'The Hero Returns'), m(2, null, 'the hero')])?.ref).toBe(2);
    expect(alMatch('Hero-Again', [m(3, 'Other', 'Other', ['Hero Again'])])?.ref).toBe(3);
  });
  it('is null when only a longer or shorter title matches, or the title has no letters or digits', () => {
    expect(alMatch('Hero', [m(1, 'The Hero'), m(2, 'Hero 2')])).toBeNull();
    expect(alMatch('영웅', [m(1, null, '', ['영웅'])])).toBeNull();
  });
});

describe('matchTitles', () => {
  it('asks for every title in one request and matches each on its own', async () => {
    const sent = answer({ m0: { media: [{ id: 1, title: { english: 'One' } }] }, m1: { media: [{ id: 2, title: { english: 'Not Two' } }] } });
    expect((await matchTitles(['One', 'Two'])).map((r) => r?.ref ?? null)).toEqual([1, null]);
    expect(sent).toEqual([{ q0: 'One', q1: 'Two' }]);
  });
});

describe('toLikeThis', () => {
  const m = (id: number, type = 'MANGA', format = 'MANGA'): AlMedia => ({ id, title: { english: `S${id}` }, type, format });
  it('lists related comics, then recommended ones that people rated up, each once', () => {
    const list = toLikeThis({
      relations: {
        edges: [
          { relationType: 'SEQUEL', node: m(1) },
          { relationType: 'ADAPTATION', node: m(2, 'ANIME', 'TV') },
          { relationType: 'SOURCE', node: m(3, 'MANGA', 'NOVEL') },
        ],
      },
      recommendations: {
        nodes: [
          { rating: 40, mediaRecommendation: m(4, 'MANGA', 'ONE_SHOT') },
          { rating: 12, mediaRecommendation: m(1) },
          { rating: 0, mediaRecommendation: m(5) },
          { rating: 9, mediaRecommendation: null },
        ],
      },
    });
    expect(list.map((r) => r.ref)).toEqual([1, 4]);
    expect(list[0]).toMatchObject({ src: 'al', title: 'S1' });
  });
  it('is empty when AniList has neither', () => {
    expect(toLikeThis({})).toEqual([]);
  });
  it('likeThis asks by id and says when the series is gone', async () => {
    const sent = answer({ Media: null });
    await expect(likeThis(7)).rejects.toThrow('AniList no longer has this series');
    expect(sent).toEqual([{ id: 7 }]);
  });
});
