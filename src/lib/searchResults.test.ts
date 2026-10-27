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
  it('uses results younger than 30 minutes as they are, and shows older ones until a day has passed', async () => {
    const r = await start(
      storage([
        ['browse::follows', { at: Date.now() - 10 * MIN, res: [hit('A')] }],
        ['search:x', { at: Date.now() - 2 * 60 * MIN, res: [hit('B')] }],
        ['search:y', { at: Date.now() - 25 * 60 * MIN, res: [hit('C')] }],
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

  it('keeps the 10 newest', async () => {
    const now = Date.now();
    const store = storage(Array.from({ length: 10 }, (_, i) => [`s${i}`, { at: now - (20 - i) * MIN, res: [] }]));
    const r = await start(store);
    r.saveResults('new', [hit('N')]);
    const kept = store.saved().map(([k]) => k);
    expect(kept).toHaveLength(10);
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
  it('loads and saves the results the Search tab opens on, once, even when Search asks while it loads', async () => {
    const r = await start(storage([]));
    r.preloadBrowse(null, 'follows');
    const res = await r.loadBrowse(null, 'follows');
    expect(r.fetch).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject([{ ref: 'm1', title: 'New' }]);
    expect(r.savedResults(r.browseKey(null, 'follows'))).toEqual(res);
    expect(r.isFresh(r.browseKey(null, 'follows'))).toBe(true);
  });

  it('does nothing when the saved results are fresh', async () => {
    const r = await start(storage([['browse::follows', { at: Date.now() - 10 * MIN, res: [hit('A')] }]]));
    r.preloadBrowse(null, 'follows');
    expect(r.fetch).not.toHaveBeenCalled();
  });

  it('keeps the older results when a load fails', async () => {
    const r = await start(storage([['browse::latest', { at: Date.now() - 2 * 60 * MIN, res: [hit('A')] }]]), () => new Response('', { status: 429 }));
    await expect(r.loadBrowse(null, 'latest')).rejects.toThrow();
    expect(r.savedResults(r.browseKey(null, 'latest'))).toEqual([hit('A')]);
  });
});
