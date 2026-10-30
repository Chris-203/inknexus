import { alMatch, details, matchTitles, search, toDetails, toTrailer, trailer, type AlMedia } from './anilist';

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
      staff: {
        edges: [
          { role: 'Story & Art', node: { name: { full: 'Pen Name' } } },
          { role: 'Story', node: { name: { full: 'Pen Name' } } },
          { role: 'Translator', node: { name: { full: 'Someone Else' } } },
        ],
      },
    });
    expect(d).toEqual({ tags: ['Action', 'Fantasy', 'Dungeon'], status: 'Completed', year: 2018, chapters: 120, authors: ['Pen Name'] });
  });
  it('gives null for an ongoing series with no chapter count and an empty status when it is missing', () => {
    expect(toDetails({ status: null, chapters: null })).toEqual({ tags: [], status: '', year: null, chapters: null, authors: [] });
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
