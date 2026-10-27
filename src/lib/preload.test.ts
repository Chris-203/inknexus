import { continueChapter, nextChapter, preloadChapter } from './preload';
import type { Chapter } from './types';

const chap = (num: number, ext = ''): Chapter => ({ id: `c${num}`, num, title: '', ext, grp: '' });

/** Images the preloader started, finished by calling `load` or `fail`. */
let imgs: { src: string; referrerPolicy: string; onload?: () => void; onerror?: () => void }[];
let calls: string[];

beforeEach(() => {
  imgs = [];
  calls = [];
  vi.stubGlobal(
    'Image',
    class {
      referrerPolicy = '';
      src = '';
      constructor() {
        imgs.push(this);
      }
    },
  );
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', async (req: string) => {
    const u = new URL(req, 'http://x').searchParams.get('url')!;
    calls.push(u);
    const files = ['1.jpg', '2.jpg', '3.jpg'];
    return new Response(JSON.stringify({ baseUrl: 'https://n.mangadex.network', chapter: { hash: 'h', data: files, dataSaver: files } }));
  });
});
afterEach(() => vi.unstubAllGlobals());

const settle = () => new Promise((r) => setTimeout(r));
const relayed = (f: string) => '/api/mdimage?url=' + encodeURIComponent(`https://n.mangadex.network/data-saver/h/${f}`);

describe('nextChapter', () => {
  const list = [chap(51), chap(52), chap(52.5), chap(53)];
  it('picks a .5 chapter before the next whole one', () => {
    expect(nextChapter(list, 52)?.num).toBe(52.5);
    expect(nextChapter(list, 52.5)?.num).toBe(53);
  });
  it('has none after the last chapter', () => {
    expect(nextChapter(list, 53)).toBeUndefined();
  });
});

describe('continueChapter', () => {
  const list = [chap(1), chap(2), chap(2.5), chap(4)];
  it('is the chapter after the last one read, skipping missing numbers', () => {
    expect(continueChapter(list, 0)?.num).toBe(1);
    expect(continueChapter(list, 2)?.num).toBe(2.5);
    expect(continueChapter(list, 2.5)?.num).toBe(4);
  });
  it('is the chapter left part way when it is not older than the last one read', () => {
    expect(continueChapter(list, 1, 2)?.num).toBe(2);
    expect(continueChapter(list, 2, 2)?.num).toBe(2);
    expect(continueChapter(list, 2.5, 1)?.num).toBe(4);
  });
  it('skips a left chapter that is not in the list, and is nothing when every chapter is read', () => {
    expect(continueChapter(list, 2.5, 3)?.num).toBe(4);
    expect(continueChapter(list, 4)).toBeUndefined();
    expect(continueChapter([], 0)).toBeUndefined();
  });
});

describe('preloadChapter', () => {
  it('loads the page list once and warms data-saver images through the relay, two at a time', async () => {
    preloadChapter(chap(7));
    await settle();
    expect(calls).toEqual(['https://api.mangadex.org/at-home/server/c7']);
    expect(imgs.map((i) => i.src)).toEqual([relayed('1.jpg'), relayed('2.jpg')]);
    expect(imgs.every((i) => i.referrerPolicy === 'same-origin')).toBe(true);
    // A failed image is left for the reader; the next one starts.
    imgs[0]!.onerror!();
    await settle();
    expect(imgs.map((i) => i.src)).toEqual([relayed('1.jpg'), relayed('2.jpg'), relayed('3.jpg')]);
  });
  it('starts no new images once stopped', async () => {
    const stop = preloadChapter(chap(8));
    await settle();
    stop();
    imgs[0]!.onload!();
    await settle();
    expect(imgs).toHaveLength(2);
  });
  it('skips a chapter hosted on another site, and no chapter', async () => {
    preloadChapter(chap(9, 'https://official.example/9'));
    preloadChapter(undefined);
    await settle();
    expect(calls).toEqual([]);
  });
  it('skips data saving and 2G connections', async () => {
    for (const connection of [{ saveData: true }, { effectiveType: 'slow-2g' }, { effectiveType: '2g' }]) {
      vi.stubGlobal('navigator', { connection });
      preloadChapter(chap(10));
    }
    await settle();
    expect(calls).toEqual([]);
    vi.stubGlobal('navigator', { connection: { effectiveType: '4g' } });
    preloadChapter(chap(10));
    await settle();
    expect(calls).toHaveLength(1);
  });
  it('ignores a failed page list', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    preloadChapter(chap(11));
    await settle();
    expect(imgs).toEqual([]);
  });
});
