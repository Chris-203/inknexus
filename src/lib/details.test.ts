import { seriesDetails } from './details';

afterEach(() => vi.unstubAllGlobals());

const media = { genres: ['Drama'], status: 'FINISHED', averageScore: 80, description: 'From AniList' };

/** Answer AniList by the query's first word after the variables (Page for a name search, Media for details) and MangaDex relay calls by URL, keeping what each was asked. */
function stub(al: { Page?: unknown; Media?: unknown } | null, md: (u: string) => unknown) {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (req: string, init?: RequestInit) => {
    if (req.startsWith('https://graphql.anilist.co')) {
      const { query, variables } = JSON.parse(String(init!.body));
      seen.push(`al ${JSON.stringify(variables)}`);
      if (!al) return new Response('{}', { status: 500 });
      return new Response(JSON.stringify({ data: query.includes('Page(') ? { m0: al.Page } : { Media: al.Media } }));
    }
    const u = new URL(req, 'http://x').searchParams.get('url')!;
    seen.push(u);
    return new Response(JSON.stringify(md(u)));
  });
  return seen;
}

const mdManga = (links: Record<string, string> | null, en = '') => ({
  data: { id: 'm1', attributes: { status: 'ongoing', links, description: { en }, tags: [] } },
});

describe('seriesDetails', () => {
  it('finds a series with only a link source on AniList by its name', async () => {
    const seen = stub({ Page: { media: [{ id: 7, title: { english: 'Hero' } }] }, Media: media }, () => ({}));
    const d = await seriesDetails({ title: 'Hero', al: null, md: null });
    expect(d).toMatchObject({ tags: ['Drama'], status: 'Completed', score: 80, desc: 'From AniList', al: 7 });
    expect(seen).toEqual(['al {"q0":"Hero"}', 'al {"id":7}']);
  });
  it('uses the AniList id MangaDex links to, adding AniList to MangaDex', async () => {
    const seen = stub({ Media: media }, (u) => (u.includes('/aggregate') ? {} : mdManga({ al: '9' })));
    const d = await seriesDetails({ title: 'Hero', al: null, md: 'm1' });
    expect(d).toMatchObject({ tags: ['Drama'], status: 'Ongoing', score: 80, desc: 'From AniList', al: 9 });
    expect(seen).toContain('al {"id":9}');
    expect(seen.some((s) => s.includes('q0'))).toBe(false);
  });
  it('asks AniList by name when MangaDex links no AniList series, and keeps the id it found', async () => {
    stub({ Page: { media: [{ id: 5, title: { romaji: 'Hero' } }] }, Media: media }, (u) => (u.includes('/aggregate') ? {} : mdManga(null, 'From MangaDex')));
    expect(await seriesDetails({ title: 'Hero', al: null, md: 'm1' })).toMatchObject({ desc: 'From MangaDex', al: 5 });
  });
  it('shows MangaDex alone when AniList fails', async () => {
    stub(null, (u) => (u.includes('/aggregate') ? {} : mdManga(null, 'From MangaDex')));
    expect(await seriesDetails({ title: 'Hero', al: 3, md: 'm1' })).toMatchObject({ status: 'Ongoing', desc: 'From MangaDex', al: null });
  });
  it('throws when AniList fails and there is no MangaDex, and gives null when AniList has nothing by that name', async () => {
    stub(null, () => ({}));
    await expect(seriesDetails({ title: 'Hero', al: 3, md: null })).rejects.toThrow();
    stub({ Page: { media: [{ id: 5, title: { english: 'Someone else' } }] } }, () => ({}));
    expect(await seriesDetails({ title: 'Hero', al: null, md: null })).toBeNull();
  });
});
