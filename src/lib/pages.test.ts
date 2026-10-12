import { chapterPages, preload } from './pages';

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

/** Images that load at once, recording their addresses; `onSrc` runs as each starts. */
const images = (onSrc = () => {}) => {
  const loaded: string[] = [];
  vi.stubGlobal(
    'Image',
    class {
      onload?: () => void;
      set src(v: string) {
        loaded.push(v);
        onSrc();
        setTimeout(() => this.onload?.());
      }
    },
  );
  return loaded;
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

  it('asks once for a server on port 443 when pages fail, and then reuses it', async () => {
    const seen = atHome();
    await chapterPages('c2');
    const retried = await Promise.all([chapterPages('c2', true), chapterPages('c2', true)]);
    expect(retried[0]![0]!.a).toBe('https://node2.example/data-saver/h/1.jpg');
    expect(retried[1]).toBe(retried[0]);
    expect(await chapterPages('c2')).toBe(retried[0]);
    expect(seen).toEqual(['https://api.mangadex.org/at-home/server/c2', 'https://api.mangadex.org/at-home/server/c2?forcePort443=true']);
  });

  it('does not keep a failed request', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    await expect(chapterPages('c3')).rejects.toThrow('HTTP 429');
    const seen = atHome();
    await chapterPages('c3');
    expect(seen).toHaveLength(1);
  });
});

describe('preload', () => {
  it('loads the chapters’ data-saver images in order', async () => {
    atHome();
    const loaded = images();
    await preload(['c4', 'c5'], new AbortController().signal);
    expect(loaded).toEqual([
      'https://node1.example/data-saver/h/1.jpg',
      'https://node1.example/data-saver/h/2.jpg',
      'https://node2.example/data-saver/h/1.jpg',
      'https://node2.example/data-saver/h/2.jpg',
    ]);
  });

  it('stops when aborted', async () => {
    const seen = atHome();
    const ac = new AbortController();
    // Leave the reader while the first image loads.
    const loaded = images(() => ac.abort());
    await preload(['c6', 'c7'], ac.signal);
    expect(loaded).toHaveLength(1);
    expect(seen).toHaveLength(1);
  });

  it('skips a chapter whose pages cannot be listed', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    const loaded = images();
    await preload(['c8'], new AbortController().signal);
    expect(loaded).toEqual([]);
  });
});
