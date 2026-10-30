import { GENRES } from '../sources/mangadex';

afterEach(() => vi.unstubAllGlobals());

const KEY = 'inknexus-search';
const MIN = 60 * 1000;
const hit = (title: string) => ({ src: 'md' as const, ref: title, title, desc: '', cover: '' });

/** A localStorage holding `entries`; `fits` decides which saves succeed. */
function storage(entries: unknown, fits: (saved: unknown[]) => boolean = () => true) {
  const m = new Map([[KEY, JSON.stringify(entries)]]);
  const setItem = (k: string, v: string) => {
    if (!fits(JSON.parse(v))) throw new DOMException('full', 'QuotaExceededError');
    m.set(k, v);
  };
  return { getItem: (k: string) => m.get(k) ?? null, setItem, saved: () => JSON.parse(m.get(KEY)!) as [string, { at: number }][] };
}

/** The module as it starts on a page load with `store` as localStorage, and a fetch for MangaDex that counts its calls. */
async function start(
  store: ReturnType<typeof storage>,
  res = () => new Response(JSON.stringify({ data: [{ id: 'm1', attributes: { title: { en: 'New' } } }] })),
) {
  vi.stubGlobal('localStorage', store);
  const fetch = vi.fn(async () => res());
  vi.stubGlobal('fetch', fetch);
  vi.resetModules();
  return { ...(await import('./searchResults')), fetch };
}

describe('saved search results', () => {
  it('uses results younger than 30 minutes as they are, and shows older ones until a week has passed', async () => {
    const r = await start(
      storage([
        ['browse::follows', { at: Date.now() - 10 * MIN, res: [hit('A')] }],
        ['search:x', { at: Date.now() - 2 * 60 * MIN, res: [hit('B')] }],
        ['search:y', { at: Date.now() - 8 * 24 * 60 * MIN, res: [hit('C')] }],
      ]),
    );
    expect(r.savedResults(r.browseKey(null, 'follows'))).toEqual([hit('A')]);
    expect(r.isFresh(r.browseKey(null, 'follows'))).toBe(true);
    expect(r.savedResults(r.searchKey('X'))).toEqual([hit('B')]);
    expect(r.isFresh(r.searchKey('X'))).toBe(false);
    expect(r.savedResults(r.searchKey('y'))).toBeUndefined();
  });

  it('ignores stored data it cannot read', async () => {
    const r = await start(storage([['a', { at: 'soon', res: [] }], ['b', { at: Date.now(), res: 'x' }], 'junk', null]));
    expect(r.savedResults('a')).toBeUndefined();
    expect(r.savedResults('b')).toBeUndefined();
  });

  it('keeps the 80 newest, with only the start of each description', async () => {
    const now = Date.now();
    const store = storage(Array.from({ length: 80 }, (_, i) => [`s${i}`, { at: now - (100 - i) * MIN, res: [] }]));
    const r = await start(store);
    r.saveResults('new', [{ ...hit('N'), desc: 'x'.repeat(1000) }]);
    expect(r.savedResults('new')![0]!.desc).toHaveLength(300);
    const kept = store.saved().map(([k]) => k);
    expect(kept).toHaveLength(80);
    expect(kept).not.toContain('s0');
    expect(kept.at(-1)).toBe('new');
  });

  it('drops the oldest when storage is full', async () => {
    const store = storage([['a', { at: Date.now() - 5 * MIN, res: [] }]], (saved) => saved.length <= 1);
    const r = await start(store);
    r.saveResults('new', []);
    expect(store.saved().map(([k]) => k)).toEqual(['new']);
  });
});

describe('preloadBrowse', () => {
  /** The genre and order each fetch asked for, in order. */
  const asked = (fetch: { mock: { calls: unknown[][] } }) =>
    fetch.mock.calls.map(([u]) => {
      const q = decodeURIComponent(String(u));
      return `${q.match(/includedTags\[\]=([^&]+)/)?.[1] ?? ''}:${q.includes('latestUploadedChapter') ? 'latest' : 'follows'}`;
    });
  const total = (1 + GENRES.length) * 2;

  it('loads the results the Search tab opens on first, then every genre and order, one at a time', async () => {
    const r = await start(storage([]));
    r.preloadBrowse(GENRES[0]!.id, 'latest');
    await vi.waitFor(() => expect(r.fetch).toHaveBeenCalledTimes(total));
    await new Promise((d) => setTimeout(d, 10));
    const got = asked(r.fetch);
    expect(got[0]).toBe(`${GENRES[0]!.id}:latest`);
    expect(new Set(got).size).toBe(total);
    expect(r.savedResults(r.browseKey(null, 'follows'))).toMatchObject([{ ref: 'm1', title: 'New' }]);
    expect(r.isFresh(r.browseKey(GENRES[1]!.id, 'latest'))).toBe(true);
  });

  it('asks once when the Search tab wants results that are loading ahead', async () => {
    const r = await start(storage([]));
    r.preloadBrowse(null, 'follows');
    await r.loadBrowse(null, 'follows');
    expect(asked(r.fetch).filter((k) => k === ':follows')).toHaveLength(1);
  });

  it('skips results on the device, reloading only the opening ones when they are older than 30 minutes', async () => {
    const all = [null, ...GENRES.map((g) => g.id)].flatMap((t) => [`browse:${t ?? ''}:follows`, `browse:${t ?? ''}:latest`]);
    const r = await start(storage(all.map((k) => [k, { at: Date.now() - 2 * 60 * MIN, res: [hit('A')] }])));
    r.preloadBrowse(null, 'latest');
    await new Promise((d) => setTimeout(d, 20));
    expect(asked(r.fetch)).toEqual([':latest']);
  });

  it('stops at the first failure and keeps the older results', async () => {
    const r = await start(storage([['browse::latest', { at: Date.now() - 2 * 60 * MIN, res: [hit('A')] }]]), () => new Response('', { status: 429 }));
    r.preloadBrowse(null, 'latest');
    await new Promise((d) => setTimeout(d, 20));
    expect(r.fetch).toHaveBeenCalledTimes(1);
    expect(r.savedResults(r.browseKey(null, 'latest'))).toEqual([hit('A')]);
  });
});

describe('AniList info', () => {
  /** MangaDex answers with `manga`; AniList answers with `al`, or fails when it is null. Returns the module and the AniList ids asked for. */
  async function withSources(manga: unknown[], al: unknown[] | null) {
    const ids: unknown[] = [];
    const r = await start(storage([]));
    vi.stubGlobal('fetch', async (u: string, init?: RequestInit) => {
      if (!u.includes('anilist')) return new Response(JSON.stringify({ data: manga }));
      ids.push(JSON.parse(String(init!.body)).variables.ids);
      return al ? new Response(JSON.stringify({ data: { Page: { media: al } } })) : new Response('', { status: 500 });
    });
    return { ...r, ids };
  }
  const manga = [
    { id: 'm1', attributes: { title: { en: 'Linked' }, description: { en: 'md text' }, links: { al: '7' } } },
    { id: 'm2', attributes: { title: { en: 'Unlinked' }, description: { en: 'other' } } },
  ];

  it('adds the score and synopsis to the series MangaDex links to AniList, in one request, and saves them', async () => {
    const r = await withSources(manga, [{ id: 7, averageScore: 81, description: 'al text' }]);
    const res = await r.loadSearch('X');
    expect(r.ids).toEqual([[7]]);
    expect(res).toMatchObject([
      { ref: 'm1', score: 81, desc: 'al text' },
      { ref: 'm2', desc: 'other' },
    ]);
    expect(res[1]!.score).toBeUndefined();
    expect(r.savedResults(r.searchKey('x'))).toEqual(res);
  });

  it('keeps the MangaDex synopsis when AniList has none, and the results as they are when AniList fails', async () => {
    const r = await withSources(manga, [{ id: 7, averageScore: null, description: '' }]);
    expect((await r.loadBrowse(null, 'follows'))[0]).toMatchObject({ desc: 'md text', score: undefined });
    const failing = await withSources(manga, null);
    expect((await failing.loadSearch('y')).map((o) => o.desc)).toEqual(['md text', 'other']);
  });

  it('asks AniList nothing when no series links to it', async () => {
    const r = await withSources([manga[1]], []);
    await r.loadSearch('z');
    expect(r.ids).toEqual([]);
  });
});
