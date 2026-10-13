import { api, apiHint, imageSrc, statusOf, why } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('goes through the same-origin relay', async () => {
    const f = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', f);
    await api('https://api.mangadex.org/manga?title=a b');
    expect(f).toHaveBeenCalledWith('/api/mangadex?url=' + encodeURIComponent('https://api.mangadex.org/manga?title=a b'), { referrerPolicy: 'same-origin' });
  });
  it('says what failed and what to try', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    await expect(api('https://api.mangadex.org/x')).rejects.toThrow('HTTP 429: MangaDex is rate-limiting, wait a minute and try again');
    expect(statusOf(await api('https://api.mangadex.org/x').catch((e: unknown) => e))).toBe(429);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api('https://api.mangadex.org/x')).rejects.toThrow('network error; check your connection and try again');
  });
  it('hints per status', () => {
    expect(apiHint(403)).toMatch(/reload/);
    expect(apiHint(404)).toMatch(/not found/);
    expect(apiHint(503)).toMatch(/down/);
    expect(apiHint(400)).toBe('try again later');
  });
  it('why falls back for non-errors', () => {
    expect(why(new Error('boom'))).toBe('boom');
    expect(why(0)).toBe('unknown error');
  });
});

describe('imageSrc', () => {
  it('sends MangaDex page images and covers through the image relay', () => {
    const page = 'https://cmdxd98sb0x3yprd.mangadex.network/data-saver/h/1-a.jpg';
    expect(imageSrc(page)).toBe('/api/mdimage?url=' + encodeURIComponent(page));
    const cover = 'https://uploads.mangadex.org/covers/m1/f.jpg.256.jpg';
    expect(imageSrc(cover)).toBe('/api/mdimage?url=' + encodeURIComponent(cover));
  });
  it('leaves other images, look-alike hosts and non-addresses alone', () => {
    for (const u of [
      'https://s4.anilist.co/file/cover.jpg',
      'https://mangadex.network.evil.example/a.jpg',
      'https://evilmangadex.network/a.jpg',
      '',
      'not a url',
    ])
      expect(imageSrc(u)).toBe(u);
  });
});
