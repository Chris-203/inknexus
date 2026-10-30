import { addDetails, alMatch, alNames, details, info, matchTitles, search, toDetails, trending, type AlMedia } from './anilist';

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
  it('trending gives the list AniList sends, from one country when asked, and says when it sends none', async () => {
    const sent = answer({ Page: { media: [{ id: 1, title: { romaji: 'A' } }] } });
    expect(await trending()).toEqual([{ id: 1, title: { romaji: 'A' } }]);
    await trending('KR');
    await trending(undefined, 'FINISHED');
    expect(sent).toEqual([{}, { c: 'KR' }, { s: 'FINISHED' }]);
    answer({ Page: {} });
    await expect(trending()).rejects.toThrow('unexpected answer');
  });
  it('info says when AniList sends no list', async () => {
    answer({});
    await expect(info([1])).rejects.toThrow('unexpected answer');
  });
  it('details asks by id and says when the series is gone', async () => {
    const sent = answer({ Media: null });
    await expect(details(7)).rejects.toThrow('AniList no longer has this series');
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
