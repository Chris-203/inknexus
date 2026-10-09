import { chapterState } from './chapters';

afterEach(() => vi.unstubAllGlobals());

describe('chapterState', () => {
  it('loads a series once, even when asked again while loading', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return new Response(JSON.stringify({ data: [{ id: 'c1', attributes: { chapter: '1', pages: 3 } }], total: 1 }));
    });
    const done = vi.fn();
    expect(chapterState('m1', done)).toEqual({ status: 'loading' });
    expect(chapterState('m1', done)).toEqual({ status: 'loading' });
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(calls).toBe(1);
    expect(chapterState('m1', done)).toMatchObject({ status: 'ready', list: { chapters: [{ id: 'c1', num: 1 }] } });
  });
});
