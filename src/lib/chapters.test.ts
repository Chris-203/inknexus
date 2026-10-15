import { chapterState, loadChapters, retryChapters, subscribeChapters } from './chapters';

afterEach(() => vi.unstubAllGlobals());

const feed = (body: object) => async () => new Response(JSON.stringify(body));

describe('loadChapters', () => {
  it('loads a series once, even when asked again while loading, and tells every subscriber', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return feed({ data: [{ id: 'c1', attributes: { chapter: '1', pages: 3 } }], total: 1 })();
    });
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeChapters(a);
    const offB = subscribeChapters(b);
    loadChapters('m1');
    loadChapters('m1');
    expect(chapterState('m1')).toEqual({ status: 'loading' });
    await vi.waitFor(() => expect(a).toHaveBeenCalledTimes(1));
    expect(b).toHaveBeenCalledTimes(1);
    expect(calls).toBe(1);
    expect(chapterState('m1')).toMatchObject({ status: 'ready', list: { chapters: [{ id: 'c1', num: 1 }] } });
    offA();
    offB();
  });

  it('keeps an error until retried, then loads again', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    const done = vi.fn();
    const off = subscribeChapters(done);
    loadChapters('m2');
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(chapterState('m2')).toMatchObject({ status: 'error' });
    loadChapters('m2');
    expect(chapterState('m2')).toMatchObject({ status: 'error' });

    vi.stubGlobal('fetch', feed({ data: [{ id: 'c2', attributes: { chapter: '2', pages: 3 } }], total: 1 }));
    retryChapters('m2');
    expect(chapterState('m2')).toEqual({ status: 'loading' });
    loadChapters('m2');
    await vi.waitFor(() => expect(chapterState('m2')).toMatchObject({ status: 'ready' }));
    off();
  });
});

describe('chapter lists kept on the device', () => {
  const KEY = 'inknexus-chapters';
  const MIN = 60 * 1000;
  const list = (n: number) => ({ chapters: [{ id: `c${n}`, num: n, title: '', ext: '', grp: '' }], listed: 1 });

  /** A localStorage holding `entries`; `fits` decides which saves succeed. */
  function storage(entries: [string, { at: number; list: object }][], fits: (saved: unknown[]) => boolean = () => true) {
    const m = new Map([[KEY, JSON.stringify(entries)]]);
    const setItem = (k: string, v: string) => {
      if (!fits(JSON.parse(v))) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    };
    return { getItem: (k: string) => m.get(k) ?? null, setItem, saved: () => JSON.parse(m.get(KEY)!) as [string, { at: number }][] };
  }

  /** The chapters module as it starts on a page load with `store` as localStorage, and a fetch that counts its calls. */
  async function start(
    store: ReturnType<typeof storage>,
    res = () => new Response(JSON.stringify({ data: [{ id: 'c9', attributes: { chapter: '9', pages: 3 } }], total: 1 })),
  ) {
    vi.stubGlobal('localStorage', store);
    const fetch = vi.fn(async () => res());
    vi.stubGlobal('fetch', fetch);
    vi.resetModules();
    return { ...(await import('./chapters')), fetch };
  }

  it('uses a list younger than 30 minutes without loading it again', async () => {
    const c = await start(storage([['a', { at: Date.now() - 10 * MIN, list: list(1) }]]));
    expect(c.chapterState('a')).toEqual({ status: 'ready', list: list(1) });
    expect(c.cachedChapters('a')).toEqual(list(1));
    c.loadChapters('a');
    expect(c.fetch).not.toHaveBeenCalled();
  });

  it('shows an older list right away, reloads it, and saves the new one', async () => {
    const store = storage([['a', { at: Date.now() - 2 * 60 * MIN, list: list(1) }]]);
    const c = await start(store);
    expect(c.chapterState('a')).toEqual({ status: 'ready', list: list(1) });
    // Too old to stand in for an update check.
    expect(c.cachedChapters('a')).toBeUndefined();
    const done = vi.fn();
    const off = c.subscribeChapters(done);
    c.loadChapters('a');
    expect(c.chapterState('a')).toEqual({ status: 'ready', list: list(1) });
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(c.chapterState('a')).toMatchObject({ status: 'ready', list: { chapters: [{ id: 'c9', num: 9 }] } });
    expect(c.fetch).toHaveBeenCalledTimes(1);
    expect(store.saved()).toHaveLength(1);
    expect(store.saved()[0]![1].at).toBeGreaterThan(Date.now() - MIN);
    off();
  });

  it('never shows a list older than a day', async () => {
    const c = await start(storage([['a', { at: Date.now() - 25 * 60 * MIN, list: list(1) }]]));
    expect(c.chapterState('a')).toEqual({ status: 'loading' });
    c.loadChapters('a');
    await vi.waitFor(() => expect(c.chapterState('a')).toMatchObject({ status: 'ready', list: { chapters: [{ num: 9 }] } }));
  });

  it('ignores stored data it cannot read', async () => {
    const store = storage([]);
    store.setItem(KEY, JSON.stringify([['a', { at: 'soon', list: list(1) }], ['b', { at: Date.now(), list: { chapters: 'x' } }], 'junk', null]));
    const c = await start(store);
    expect(c.chapterState('a')).toEqual({ status: 'loading' });
    expect(c.chapterState('b')).toEqual({ status: 'loading' });
  });

  it('keeps the 30 newest lists', async () => {
    const now = Date.now();
    const old = Array.from({ length: 30 }, (_, i): [string, { at: number; list: object }] => [`s${i}`, { at: now - (40 - i) * MIN, list: list(i) }]);
    const store = storage(old);
    const c = await start(store);
    c.loadChapters('new');
    await vi.waitFor(() => expect(c.chapterState('new')).toMatchObject({ status: 'ready' }));
    const kept = store.saved().map(([md]) => md);
    expect(kept).toHaveLength(30);
    expect(kept).not.toContain('s0');
    expect(kept.at(-1)).toBe('new');
  });

  it('drops the oldest lists when storage is full', async () => {
    const now = Date.now();
    const store = storage(
      [
        ['a', { at: now - 50 * MIN, list: list(1) }],
        ['b', { at: now - 45 * MIN, list: list(2) }],
      ],
      (saved) => saved.length <= 2,
    );
    const c = await start(store);
    c.loadChapters('new');
    await vi.waitFor(() => expect(c.chapterState('new')).toMatchObject({ status: 'ready' }));
    expect(store.saved().map(([md]) => md)).toEqual(['b', 'new']);
    // Still there for this visit.
    expect(c.chapterState('a')).toMatchObject({ status: 'ready' });
  });

  it('keeps the older list when a reload is rate limited, says why, and does not try again until retried', async () => {
    const store = storage([['a', { at: Date.now() - 2 * 60 * MIN, list: list(1) }]]);
    const before = store.saved();
    const c = await start(store, () => new Response('', { status: 429 }));
    const done = vi.fn();
    const off = c.subscribeChapters(done);
    c.loadChapters('a');
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(c.chapterState('a')).toStrictEqual({ status: 'ready', list: list(1), error: expect.stringContaining('HTTP 429') });
    c.loadChapters('a');
    expect(c.fetch).toHaveBeenCalledTimes(1);
    expect(store.saved()).toEqual(before);

    // Trying again reloads it in the background, with the older list still shown and no error.
    c.retryChapters('a');
    expect(c.chapterState('a')).toStrictEqual({ status: 'ready', list: list(1) });
    c.loadChapters('a');
    expect(c.fetch).toHaveBeenCalledTimes(2);
    off();
  });
});
