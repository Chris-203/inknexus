import { details, search, toDetails } from './anilist';

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

describe('AniList requests', () => {
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
