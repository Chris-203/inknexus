import { api, apiHint, statusOf, why } from './api';

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
