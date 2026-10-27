import type { Chapter } from './types';

const chap = (num: number, ext = ''): Chapter => ({ id: `c${num}`, num, title: '', ext, grp: '' });
const relayed = (id: string, f: string) => '/api/mdimage?url=' + encodeURIComponent(`https://n.mangadex.network/data-saver/${id}/${f}`);
const settle = () => new Promise((r) => setTimeout(r));

/** Saved images by relay address, and the saved list as localStorage has it. */
let images: Map<string, Response>;
let stored: Map<string, string>;
/** Image addresses that answer with an error, and whether the cache is out of room. */
let broken: Set<string>;
let full: boolean;

function stub(controller = true) {
  const cache = {
    put: async (k: string, r: Response) => {
      if (full) throw new DOMException('full', 'QuotaExceededError');
      images.set(k, r);
    },
    delete: async (k: string | { url: string }) => images.delete(typeof k === 'string' ? k : new URL(k.url).pathname + new URL(k.url).search),
    keys: async () => [...images.keys()].map((k) => ({ url: 'http://x' + k })),
  };
  vi.stubGlobal('caches', { open: async () => cache, delete: async () => images.clear() });
  vi.stubGlobal('location', { href: 'http://x/' });
  vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v) });
  vi.stubGlobal('navigator', { serviceWorker: { controller: controller ? {} : null, addEventListener() {} } });
  vi.stubGlobal('fetch', async (req: string) => {
    if (req.startsWith('/api/mdimage')) return broken.has(req) ? new Response('', { status: 502 }) : new Response(new Blob(['x'.repeat(100)]));
    const id = new URL(req, 'http://x').searchParams.get('url')!.split('/').pop()!;
    const files = ['1.jpg', '2.jpg', '3.jpg'];
    return new Response(JSON.stringify({ baseUrl: 'https://n.mangadex.network', chapter: { hash: id, data: files, dataSaver: files } }));
  });
}

async function load(controller = true) {
  stub(controller);
  vi.resetModules();
  const m = await import('./downloads');
  await settle();
  return m;
}

beforeEach(() => {
  images = new Map();
  stored = new Map();
  broken = new Set();
  full = false;
});
afterEach(() => vi.unstubAllGlobals());

const x = { id: 's1', title: 'Placeholder' };
const saved = () => JSON.parse(stored.get('inknexus-downloads') || '[]');

describe('aheadOf', () => {
  it('takes the next chapters from the one given, skipping those hosted elsewhere', async () => {
    const { aheadOf } = await load();
    const list = [chap(1), chap(2), chap(3, 'https://example.com/3'), chap(4), chap(5), chap(6)];
    expect(aheadOf(list, list[1]!).map((c) => c.num)).toEqual([2, 4, 5]);
    expect(aheadOf(list, list[4]!, 3).map((c) => c.num)).toEqual([5, 6]);
  });
});

describe('saveChapters', () => {
  it('saves each image and the chapter with its size, with no full-quality fallback, and skips a saved chapter', async () => {
    const { saveChapters, savedChapter } = await load();
    await saveChapters(x, [chap(1), chap(2)]);
    expect([...images.keys()]).toHaveLength(6);
    expect(images.has(relayed('c1', '2.jpg'))).toBe(true);
    expect(saved().map((d: { c: Chapter; bytes: number }) => [d.c.num, d.bytes])).toEqual([
      [1, 300],
      [2, 300],
    ]);
    expect(savedChapter('s1', 2)?.pages[0]).toEqual({ a: 'https://n.mangadex.network/data-saver/c2/1.jpg', b: '' });
    images.clear();
    await saveChapters(x, [chap(1)]);
    expect(images.size).toBe(0);
  });

  it('on a failed image keeps the chapters saved before it and removes the failed chapter’s images', async () => {
    const { saveChapters } = await load();
    broken.add(relayed('c2', '3.jpg'));
    await expect(saveChapters(x, [chap(1), chap(2), chap(3)])).rejects.toThrow('HTTP 502');
    expect(saved().map((d: { c: Chapter }) => d.c.num)).toEqual([1]);
    expect([...images.keys()].every((k) => k.includes('c1'))).toBe(true);
  });

  it('says to make room when storage is full', async () => {
    const { saveChapters } = await load();
    full = true;
    await expect(saveChapters(x, [chap(1)])).rejects.toThrow('no room left');
    expect(saved()).toEqual([]);
  });

  it('runs one save at a time', async () => {
    const { saveChapters } = await load();
    const first = saveChapters(x, [chap(1)]);
    await expect(saveChapters(x, [chap(2)])).rejects.toThrow('another series is saving');
    await first;
  });
});

describe('savedChapter', () => {
  it('is nothing without the service worker that serves saved images', async () => {
    stored.set('inknexus-downloads', JSON.stringify([{ x: 's1', t: 'P', c: chap(1), pages: [], bytes: 0 }]));
    const { savedChapter } = await load(false);
    expect(savedChapter('s1', 1)).toBeUndefined();
  });
});

describe('removing', () => {
  it('removeDownload drops the chapter and its images, and leaves the others', async () => {
    const { saveChapters, removeDownload } = await load();
    await saveChapters(x, [chap(1), chap(2)]);
    removeDownload('c1');
    await settle();
    expect(saved().map((d: { c: Chapter }) => d.c.num)).toEqual([2]);
    expect([...images.keys()].every((k) => k.includes('c2'))).toBe(true);
  });

  it('removeAllDownloads empties the list and the images', async () => {
    const { saveChapters, removeAllDownloads } = await load();
    await saveChapters(x, [chap(1)]);
    removeAllDownloads();
    await settle();
    expect(saved()).toEqual([]);
    expect(images.size).toBe(0);
  });
});

describe('on launch', () => {
  it('drops chapters whose images the browser cleared and images no chapter needs', async () => {
    const page = (id: string) => ({ a: `https://n.mangadex.network/data-saver/${id}/1.jpg`, b: '' });
    stored.set(
      'inknexus-downloads',
      JSON.stringify([
        { x: 's1', t: 'P', c: chap(1), pages: [page('c1')], bytes: 1 },
        { x: 's1', t: 'P', c: chap(2), pages: [page('c2')], bytes: 1 },
        { x: 's1', t: 'P', c: 'not a chapter', pages: [], bytes: 1 },
      ]),
    );
    images.set(relayed('c1', '1.jpg'), new Response(''));
    images.set(relayed('old', '1.jpg'), new Response(''));
    await load();
    expect(saved().map((d: { c: Chapter }) => d.c.num)).toEqual([1]);
    expect([...images.keys()]).toEqual([relayed('c1', '1.jpg')]);
  });
});
