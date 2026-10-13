import handler from './mdimage.js';

const { target } = handler as unknown as { target: (raw: unknown) => URL | null };

afterEach(() => vi.unstubAllGlobals());

const PAGE = 'https://cmdxd98sb0x3yprd.mangadex.network/data-saver/ac9ed259/1-fef0.jpg';

/** Call the relay as a same-site page would, and collect what it sends back. */
async function call(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const req = {
    method: init.method || 'GET',
    url: '/api/mdimage?url=' + encodeURIComponent(url),
    headers: init.headers || { 'sec-fetch-site': 'same-origin' },
  };
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    getHeader: (k: string) => headers[k.toLowerCase()],
    end(b: unknown) {
      this.body = b;
    },
  };
  await handler(req as never, res as never);
  return { status: res.statusCode, headers, body: res.body };
}

/** MangaDex answers each image request with `answer`; reports are recorded. */
function mangadex(answer: () => Response | Promise<Response>) {
  const asked: { url: string; ua?: string }[] = [];
  const reports: Record<string, unknown>[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const h = init.headers as Record<string, string>;
    if (url === 'https://api.mangadex.network/report') {
      reports.push(JSON.parse(String(init.body)));
      return new Response('');
    }
    asked.push({ url, ua: h['User-Agent'] });
    return answer();
  });
  return { asked, reports };
}

describe('target', () => {
  it('takes MangaDex@Home page images, with or without a token or port, and MangaDex pages and covers', () => {
    for (const u of [
      PAGE,
      'https://abc.mangadex.network/data/ac9ed259/1-fef0.png',
      'https://abc.mangadex.network:44300/sometoken/data/ac9ed259/1-fef0.png',
      'https://uploads.mangadex.org/data/ac9ed259/1-fef0.png',
      'https://uploads.mangadex.org/covers/6fc3bb28-6c67-4345-8088-ec3c856e9b36/f.jpg.256.jpg',
    ])
      expect(target(u)?.href).toBe(u);
  });
  it('refuses anything else', () => {
    for (const u of [
      'http://abc.mangadex.network/data/ac9ed259/1.png',
      'https://mangadex.network.evil.example/data/ac9ed259/1.png',
      'https://evilmangadex.network/data/ac9ed259/1.png',
      'https://api.mangadex.org/at-home/server/x',
      'https://abc.mangadex.network/other/ac9ed259/1.png',
      'https://abc.mangadex.network/data/ac9ed259/1.png?x=1',
      'https://user:pw@abc.mangadex.network/data/ac9ed259/1.png',
      'https://uploads.mangadex.org:8443/covers/6fc3bb28-6c67-4345-8088-ec3c856e9b36/f.jpg',
      'https://s4.anilist.co/file/cover.jpg',
      'not a url',
      '',
      null,
    ])
      expect(target(u)).toBeNull();
  });
});

describe('handler', () => {
  it('relays an image with an honest User-Agent, lets it be cached, and reports it', async () => {
    const { asked, reports } = mangadex(() => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg', 'x-cache': 'HIT (fresh)' } }));
    const r = await call(PAGE);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/jpeg');
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, s-maxage=31536000, immutable');
    expect(asked).toEqual([{ url: PAGE, ua: 'InkNexus/1.0' }]);
    expect(reports).toEqual([{ url: PAGE, success: true, bytes: 3, duration: expect.any(Number), cached: true }]);
  });
  it('never caches a refused image, and reports it', async () => {
    const { reports } = mangadex(() => new Response('', { status: 404 }));
    const r = await call(PAGE);
    expect(r.status).toBe(502);
    expect(r.body).toBe('MangaDex answered 404');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(reports).toEqual([{ url: PAGE, success: false, bytes: 0, duration: expect.any(Number), cached: false }]);
  });
  it('treats a non-image answer as a failure', async () => {
    mangadex(() => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    expect((await call(PAGE)).status).toBe(502);
  });
  it('says when MangaDex cannot be reached, and reports 0 bytes', async () => {
    const { reports } = mangadex(() => {
      throw new TypeError('fetch failed');
    });
    const r = await call(PAGE);
    expect([r.status, r.body]).toEqual([502, 'Could not reach MangaDex']);
    expect(reports[0]).toMatchObject({ success: false, bytes: 0 });
  });
  it('does not report covers from mangadex.org', async () => {
    const { reports } = mangadex(() => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }));
    expect((await call('https://uploads.mangadex.org/covers/6fc3bb28-6c67-4345-8088-ec3c856e9b36/f.jpg.256.jpg')).status).toBe(200);
    expect(reports).toEqual([]);
  });
  it('refuses other sites, other methods and other addresses without asking MangaDex', async () => {
    const { asked } = mangadex(() => new Response(''));
    expect((await call(PAGE, { headers: { 'sec-fetch-site': 'cross-site', host: 'inknexus.example', origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call(PAGE, { method: 'POST' })).status).toBe(405);
    expect((await call('https://evil.example/data/a/1.png')).status).toBe(403);
    expect(asked).toEqual([]);
  });
});
