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

describe('saveChapter', () => {
  it('saves each image and the chapter with its size, with no full-quality fallback, and skips a saved chapter', async () => {
    const { saveChapter, savedChapter } = await load();
    expect(await saveChapter(x, chap(1))).toBe(true);
    expect(await saveChapter(x, chap(2))).toBe(true);
    expect([...images.keys()]).toHaveLength(6);
    expect(images.has(relayed('c1', '2.jpg'))).toBe(true);
    expect(saved().map((d: { c: Chapter; bytes: number }) => [d.c.num, d.bytes])).toEqual([
      [1, 300],
      [2, 300],
    ]);
    expect(savedChapter('s1', 2)?.pages[0]).toEqual({ a: 'https://n.mangadex.network/data-saver/c2/1.jpg', b: '' });
    images.clear();
    expect(await saveChapter(x, chap(1))).toBe(false);
    expect(images.size).toBe(0);
  });

  it('saves chapters tapped together one at a time, in the order tapped, and a chapter tapped twice once', async () => {
    const { saveChapter } = await load();
    const runs = [saveChapter(x, chap(3)), saveChapter(x, chap(1)), saveChapter(x, chap(3))];
    expect(await Promise.all(runs)).toEqual([true, true, false]);
    expect(saved().map((d: { c: Chapter }) => d.c.num)).toEqual([3, 1]);
  });

  it('on a failed image removes that chapter’s images, keeps the ones saved before, and drops the ones waiting', async () => {
    const { saveChapter } = await load();
    broken.add(relayed('c2', '3.jpg'));
    const runs = [saveChapter(x, chap(1)), saveChapter(x, chap(2)), saveChapter(x, chap(3))];
    expect(await runs[0]).toBe(true);
    await expect(runs[1]).rejects.toThrow('HTTP 502');
    expect(await runs[2]).toBe(false);
    expect(saved().map((d: { c: Chapter }) => d.c.num)).toEqual([1]);
    expect([...images.keys()].every((k) => k.includes('c1'))).toBe(true);
    // The next tap starts again.
    expect(await saveChapter(x, chap(3))).toBe(true);
  });

  it('says to make room when storage is full', async () => {
    const { saveChapter } = await load();
    full = true;
    await expect(saveChapter(x, chap(1))).rejects.toThrow('no room left');
    expect(saved()).toEqual([]);
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
    const { saveChapter, removeDownload } = await load();
    await saveChapter(x, chap(1));
    await saveChapter(x, chap(2));
    removeDownload('c1');
    await settle();
    expect(saved().map((d: { c: Chapter }) => d.c.num)).toEqual([2]);
    expect([...images.keys()].every((k) => k.includes('c2'))).toBe(true);
  });

  it('removeAllDownloads empties the list and the images', async () => {
    const { saveChapter, removeAllDownloads } = await load();
    await saveChapter(x, chap(1));
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
