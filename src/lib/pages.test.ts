import { chapterPages, retrySrc } from './pages';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Answer at-home requests with a server named after the request count, and record the MangaDex URLs asked for. */
const atHome = () => {
  const seen: string[] = [];
  vi.stubGlobal('fetch', async (req: string) => {
    seen.push(new URL(req, 'http://x').searchParams.get('url')!);
    return new Response(
      JSON.stringify({ baseUrl: `https://node${seen.length}.example`, chapter: { hash: 'h', data: ['1.png', '2.png'], dataSaver: ['1.jpg', '2.jpg'] } }),
    );
  });
  return seen;
};

describe('chapterPages', () => {
  it('reuses a chapter for 10 minutes, then asks again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const seen = atHome();
    expect((await chapterPages('c1'))[0]!.a).toBe('https://node1.example/data-saver/h/1.jpg');
    await chapterPages('c1');
    expect(seen).toHaveLength(1);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    expect((await chapterPages('c1'))[0]!.a).toBe('https://node2.example/data-saver/h/1.jpg');
  });

  it('asks again once for fresh links when pages fail, and then reuses them', async () => {
    const seen = atHome();
    await chapterPages('c2');
    const fresh = await Promise.all([chapterPages('c2', true), chapterPages('c2', true)]);
    expect(fresh[0]![0]!.a).toBe('https://node2.example/data-saver/h/1.jpg');
    expect(fresh[1]).toBe(fresh[0]);
    expect(await chapterPages('c2')).toBe(fresh[0]);
    expect(seen).toEqual(['https://api.mangadex.org/at-home/server/c2', 'https://api.mangadex.org/at-home/server/c2']);
  });

  it('does not keep a failed request', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    await expect(chapterPages('c3')).rejects.toThrow('HTTP 429');
    const seen = atHome();
    await chapterPages('c3');
    expect(seen).toHaveLength(1);
  });
});

describe('retrySrc', () => {
  it('tries full quality from the same server, then fresh links, then gives up', async () => {
    const seen = atHome();
    await chapterPages('c4');
    const tries = [];
    for (let t = 0; t < 4; t++) tries.push(await retrySrc('c4', 1, t));
    expect(tries).toEqual(['https://node1.example/data/h/2.png', 'https://node2.example/data-saver/h/2.jpg', 'https://node2.example/data/h/2.png', '']);
    expect(seen).toHaveLength(2);
  });

  it('gives up when fresh links cannot be had', async () => {
    atHome();
    await chapterPages('c5');
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    expect(await retrySrc('c5', 0, 1)).toBe('');
  });

  it('gives up on a page MangaDex no longer lists', async () => {
    atHome();
    expect(await retrySrc('c6', 5, 0)).toBe('');
  });
});
