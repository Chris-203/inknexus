import handler from './mangadex.js';

const { cacheFor } = handler as unknown as { cacheFor: (u: URL) => string };

afterEach(() => vi.unstubAllGlobals());

const MD = 'https://api.mangadex.org';
const ID = '6fc3bb28-6c67-4345-8088-ec3c856e9b36';

/** Call the relay as a same-site page would, with MangaDex answering `answer`. */
async function call(url: string, answer: Response) {
  vi.stubGlobal('fetch', async () => answer);
  const req = { method: 'GET', url: '/api/mangadex?url=' + encodeURIComponent(url), headers: { 'sec-fetch-site': 'same-origin' } };
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    getHeader: (k: string) => headers[k.toLowerCase()],
    end() {},
  };
  await handler(req as never, res as never);
  return { status: res.statusCode, headers };
}

/** Seconds an edge cache may keep serving an answer, fresh or stale. */
function lifetime(cc: string) {
  const n = (k: string) => Number(cc.match(new RegExp(k + '=(\\d+)'))?.[1] || 0);
  return n('s-maxage') + n('stale-while-revalidate');
}

describe('cacheFor', () => {
  it('shares search briefly', () => {
    expect(cacheFor(new URL(`${MD}/manga?title=solo&limit=20`))).toBe('public, max-age=0, s-maxage=60, stale-while-revalidate=120');
  });
  it('shares series details for an hour', () => {
    expect(cacheFor(new URL(`${MD}/manga/${ID}?includes[]=cover_art`))).toBe('public, max-age=0, s-maxage=3600, stale-while-revalidate=82800');
    expect(cacheFor(new URL(`${MD}/manga/${ID.toUpperCase()}`))).toMatch(/s-maxage=3600/);
  });
  it('shares chapter feeds for five minutes', () => {
    expect(cacheFor(new URL(`${MD}/manga/${ID}/feed?translatedLanguage[]=en&limit=500`))).toBe('public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  });
  it('never keeps anything at the edge past a day, and never in the browser', () => {
    for (const p of ['/manga', `/manga/${ID}`, `/manga/${ID}/feed`]) {
      const cc = cacheFor(new URL(MD + p));
      expect(lifetime(cc)).toBeLessThanOrEqual(86400);
      expect(cc).toMatch(/max-age=0/);
    }
  });
  it('caches nothing else, at-home/server above all', () => {
    for (const p of [
      `/at-home/server/${ID}`,
      `/chapter/${ID}`,
      `/manga/${ID}/aggregate`,
      `/manga/${ID}/feed/x`,
      '/manga/not-a-uuid',
      `/manga/${ID}x`,
      '/manga/random',
      '/manga/',
      '/',
    ])
      expect(cacheFor(new URL(MD + p))).toBe('no-store');
  });
});

describe('handler', () => {
  it('sends the cache lifetime with a 200', async () => {
    const r = await call(`${MD}/manga/${ID}`, new Response('{}', { headers: { 'content-type': 'application/json' } }));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toMatch(/s-maxage=3600/);
  });
  it('never caches an error, a 429 included, and passes Retry-After on', async () => {
    const r = await call(`${MD}/manga/${ID}/feed`, new Response('{}', { status: 429, headers: { 'retry-after': '30' } }));
    expect(r.status).toBe(429);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['retry-after']).toBe('30');
    expect((await call(`${MD}/manga/${ID}`, new Response('', { status: 404 }))).headers['cache-control']).toBe('no-store');
    expect((await call(`${MD}/manga`, new Response('', { status: 503 }))).headers['cache-control']).toBe('no-store');
  });
});
