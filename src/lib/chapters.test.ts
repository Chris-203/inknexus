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
