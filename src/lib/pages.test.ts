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
  it('asks MangaDex each time a chapter is opened', async () => {
    const seen = atHome();
    expect((await chapterPages('c1'))[0]!.a).toBe('https://node1.example/data-saver/h/1.jpg');
    expect((await chapterPages('c1'))[0]!.a).toBe('https://node2.example/data-saver/h/1.jpg');
    expect(seen).toEqual(['https://api.mangadex.org/at-home/server/c1', 'https://api.mangadex.org/at-home/server/c1']);
  });
});

describe('retrySrc', () => {
  it('tries full quality from the same server, then fresh links, then gives up', async () => {
    const seen = atHome();
    await chapterPages('c2');
    const tries = [];
    for (let t = 0; t < 4; t++) tries.push(await retrySrc('c2', 1, t));
    expect(tries).toEqual(['https://node1.example/data/h/2.png', 'https://node2.example/data-saver/h/2.jpg', 'https://node2.example/data/h/2.png', '']);
    expect(seen).toHaveLength(2);
  });

  it('shares one request for fresh links between pages failing within a minute, then asks again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const seen = atHome();
    await chapterPages('c3');
    await Promise.all([retrySrc('c3', 0, 1), retrySrc('c3', 1, 1), retrySrc('c3', 1, 2)]);
    expect(seen).toHaveLength(2);
    vi.setSystemTime(Date.now() + 60_000);
    expect(await retrySrc('c3', 0, 1)).toBe('https://node3.example/data-saver/h/1.jpg');
  });

  it('asks for fresh links when the chapter is opened again after a retry', async () => {
    const seen = atHome();
    await chapterPages('c4');
    await retrySrc('c4', 0, 1);
    await chapterPages('c4');
    expect(await retrySrc('c4', 0, 1)).toBe('https://node4.example/data-saver/h/1.jpg');
    expect(seen).toHaveLength(4);
  });

  it('gives up when fresh links cannot be had, and asks again on the next failure', async () => {
    atHome();
    await chapterPages('c5');
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    expect(await retrySrc('c5', 0, 1)).toBe('');
    const seen = atHome();
    expect(await retrySrc('c5', 1, 1)).toBe('https://node1.example/data-saver/h/2.jpg');
    expect(seen).toHaveLength(1);
  });

  it('gives up on a page MangaDex no longer lists', async () => {
    atHome();
    await chapterPages('c6');
    expect(await retrySrc('c6', 5, 0)).toBe('');
  });
});
