import { moreLikeThis } from './moreLikeThis';

afterEach(() => vi.unstubAllGlobals());

const al = (id: number, english: string) => ({ id, title: { english }, type: 'MANGA', format: 'MANGA' });
const md = (id: string, en: string) => ({ id, attributes: { title: { en } } });
const rec = (id: string, score: number) => ({
  attributes: { score },
  relationships: [
    { id: 'me', type: 'manga' },
    { id, type: 'manga' },
  ],
});

/** Answer AniList with `alData` (or fail with `alStatus`) and MangaDex relay calls by URL, keeping what each was asked. */
function stub(alData: unknown, mdAnswer: (u: string) => unknown, alStatus = 200, mdStatus = 200) {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (req: string, init?: RequestInit) => {
    if (req.startsWith('https://graphql.anilist.co')) {
      seen.push(`al ${JSON.stringify(JSON.parse(String(init!.body)).variables)}`);
      return new Response(JSON.stringify({ data: alData }), { status: alStatus });
    }
    const u = new URL(req, 'http://x').searchParams.get('url')!;
    seen.push(u);
    return new Response(JSON.stringify(mdAnswer(u)), { status: mdStatus });
  });
  return seen;
}

describe('moreLikeThis', () => {
  it("lists AniList's picks first, opened from MangaDex when it has the same name, then fills in MangaDex's own, each once and never the series itself", async () => {
    const seen = stub(
      {
        Media: {
          relations: { edges: [{ relationType: 'SEQUEL', node: al(2, 'Hero 2') }] },
          recommendations: {
            nodes: [
              { rating: 5, mediaRecommendation: al(3, 'Other') },
              { rating: 4, mediaRecommendation: al(4, 'Hero') },
            ],
          },
        },
      },
      (u) => {
        if (u.endsWith('/recommendation')) return { data: [rec('b', 0.9), rec('a', 1)] };
        if (u.includes('ids[]')) return { data: [md('a', 'Hero 2'), md('b', 'Fresh')] };
        return { data: [md('o', 'Other')] };
      },
    );
    const r = await moreLikeThis({ title: 'Hero', al: 1, md: 'me' });
    expect(r.list.map((k) => `${k.src}:${k.ref}`)).toEqual(['md:a', 'md:o', 'md:b']);
    expect(r.missed).toBe('');
    // 'Hero 2' was among MangaDex's picks, so only 'Other' is looked up by name.
    expect(seen.filter((u) => u.includes('title='))).toHaveLength(1);
  });
  it('finds the series on AniList by name when its id is not known, and keeps AniList series MangaDex does not have', async () => {
    stub({ m0: { media: [al(9, 'Lone')] }, Media: { recommendations: { nodes: [{ rating: 3, mediaRecommendation: al(5, 'Only On AniList') }] } } }, () => ({
      data: [],
    }));
    const r = await moreLikeThis({ title: 'Lone', al: null, md: null });
    expect(r.list.map((k) => `${k.src}:${k.ref}`)).toEqual(['al:5']);
  });
  it("shows MangaDex's picks and says AniList failed when only AniList fails", async () => {
    stub(null, (u) => (u.endsWith('/recommendation') ? { data: [rec('a', 1)] } : { data: [md('a', 'A')] }), 429);
    const r = await moreLikeThis({ title: 'Rate', al: 1, md: 'me' });
    expect(r.list.map((k) => k.ref)).toEqual(['a']);
    expect(r.missed).toMatch(/^AniList failed \(HTTP 429/);
  });
  it('fails with the reason when a source fails and the other has nothing, or both fail', async () => {
    stub(null, () => ({}), 500);
    await expect(moreLikeThis({ title: 'Down', al: 1, md: null })).rejects.toThrow('HTTP 500');
    stub(null, () => ({}), 500, 503);
    await expect(moreLikeThis({ title: 'Both', al: 1, md: 'me' })).rejects.toThrow(/^AniList: HTTP 500.*; MangaDex: HTTP 503/);
  });
  it('asks once per series this session, but again after a failure', async () => {
    const seen = stub({ Media: {} }, () => ({ data: [] }));
    await moreLikeThis({ title: 'Once', al: 1, md: null });
    await moreLikeThis({ title: 'Once', al: 1, md: null });
    expect(seen).toHaveLength(1);
    stub(null, () => ({}), 500);
    await expect(moreLikeThis({ title: 'Again', al: 1, md: null })).rejects.toThrow();
    const again = stub({ Media: {} }, () => ({ data: [] }));
    await moreLikeThis({ title: 'Again', al: 1, md: null });
    expect(again).toHaveLength(1);
  });
});
