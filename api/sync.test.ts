import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import handler from './sync.js';

const { MAX_BYTES, RATE_LIMIT } = handler as unknown as { MAX_BYTES: number; RATE_LIMIT: number };

const CODE = 'phone-and-laptop-code-0001';
const OTHER = 'someone-elses-sync-code-02';
const LIB = { lib: [{ id: 'a', title: 'A “quoted” title', last: 12 }], sort: 'asc' };

/** What Redis holds: values by key, as the scripts in sync.js leave them. */
let redis: Map<string, { v: number; data: string } | number>;
/** Every request sent to Upstash. */
let sent: { url: string; token: string; command: unknown[] }[];

/** Upstash's REST API with the two scripts of sync.js done in JavaScript: count the request, then load or save. */
async function upstash(url: string, init: RequestInit) {
  const command = JSON.parse(String(init.body)) as [string, string, number, string, string, number, number, number?, string?];
  sent.push({ url, token: (init.headers as Record<string, string>).Authorization ?? '', command });
  const [, , , rate, key, seconds, limit, base, data] = command;
  const n = ((redis.get(rate) as number) || 0) + 1;
  redis.set(rate, n);
  if (n > limit) return Response.json({ result: ['limit', seconds] });
  const saved = redis.get(key) as { v: number; data: string } | undefined;
  const v = saved?.v ?? 0;
  if (base === undefined) return Response.json({ result: ['ok', v, saved?.data ?? null] });
  if (base !== v) return Response.json({ result: ['stale', v, saved?.data ?? null] });
  redis.set(key, { v: v + 1, data: data! });
  return Response.json({ result: ['ok', v + 1] });
}

beforeEach(() => {
  redis = new Map();
  sent = [];
  vi.stubGlobal('fetch', upstash);
  vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
  vi.stubEnv('KV_REST_API_TOKEN', 'store-token');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

interface Options {
  code?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Call the function as a same-site page would. A string body is sent as it is, anything else as JSON. */
async function call(method: string, { code = CODE, body, headers = {} }: Options = {}) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const req = Object.assign(Readable.from(text ? [Buffer.from(text)] : []), {
    method,
    url: '/api/sync',
    headers: { 'sec-fetch-site': 'same-origin', 'x-real-ip': '203.0.113.7', ...(code ? { authorization: `Bearer ${code}` } : {}), ...headers },
  });
  const sentHeaders: Record<string, string> = {};
  const res = {
    statusCode: 0,
    body: '',
    setHeader: (k: string, v: string) => void (sentHeaders[k.toLowerCase()] = v),
    getHeader: (k: string) => sentHeaders[k.toLowerCase()],
    end(b: string) {
      res.body = b;
    },
  };
  await handler(req as never, res as never);
  const json = sentHeaders['content-type'] === 'application/json' ? JSON.parse(res.body) : undefined;
  return { status: res.statusCode, headers: sentHeaders, text: res.body, json };
}

function save(version: number, library: unknown, options: Options = {}) {
  return call('PUT', { ...options, body: { version, library } });
}

describe('who may call it', () => {
  it('answers GET and PUT only', async () => {
    for (const m of ['POST', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']) {
      const r = await call(m);
      expect(r.status).toBe(405);
      expect(r.headers.allow).toBe('GET, PUT');
    }
    expect(sent).toEqual([]);
  });
  it('refuses other sites', async () => {
    const cross = { 'sec-fetch-site': 'cross-site', host: 'inknexus.example', origin: 'https://evil.example' };
    expect((await call('GET', { headers: cross })).status).toBe(403);
    expect((await save(0, LIB, { headers: cross })).status).toBe(403);
    expect(sent).toEqual([]);
  });
  it('needs a sync code of 20 to 128 letters, digits, - or _', async () => {
    for (const code of [null, 'short', 'a'.repeat(19), 'a'.repeat(129), 'has spaces in it so it is bad', 'slash/in/the/code/0123456789']) {
      const r = await call('GET', { code });
      expect(r.status).toBe(401);
      expect(r.text).toMatch(/Authorization: Bearer/);
    }
    expect((await call('GET', { headers: { authorization: `Basic ${CODE}` } })).status).toBe(401);
    expect(sent).toEqual([]);
    expect((await call('GET', { code: 'a'.repeat(20) })).status).toBe(200);
    expect((await call('GET', { code: 'a'.repeat(128) })).status).toBe(200);
  });
});

describe('loading and saving', () => {
  it('answers version 0 and no library before the first save', async () => {
    const r = await call('GET');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ version: 0, library: null });
    expect(r.headers['cache-control']).toBe('no-store');
  });
  it('saves a library and gives it back as it was sent', async () => {
    const r = await save(0, LIB);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ version: 1 });
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await call('GET')).json).toEqual({ version: 1, library: LIB });
  });
  it('keeps any JSON object or list without reading it', async () => {
    const odd = { anything: [1, 'two', null, { deep: { er: true } }], '': 0 };
    expect((await save(0, odd)).json).toEqual({ version: 1 });
    expect((await save(1, [1, 2, 3])).json).toEqual({ version: 2 });
    expect((await call('GET')).json).toEqual({ version: 2, library: [1, 2, 3] });
  });
  it('counts the version up on each save', async () => {
    for (let v = 0; v < 5; v++) expect((await save(v, { ...LIB, n: v })).json).toEqual({ version: v + 1 });
    expect((await call('GET')).json).toEqual({ version: 5, library: { ...LIB, n: 4 } });
  });
  it('keeps each code to its own library', async () => {
    await save(0, LIB);
    expect((await call('GET', { code: OTHER })).json).toEqual({ version: 0, library: null });
    await save(0, { lib: [] }, { code: OTHER });
    expect((await call('GET')).json).toEqual({ version: 1, library: LIB });
    expect((await call('GET', { code: OTHER })).json).toEqual({ version: 1, library: { lib: [] } });
  });
});

describe('a save based on an older version', () => {
  it('is refused with the current copy, which stays as it was', async () => {
    await save(0, LIB);
    const phone = { lib: [{ id: 'a', last: 13 }] };
    const laptop = { lib: [{ id: 'a', last: 40 }] };
    expect((await save(1, phone)).json).toEqual({ version: 2 });
    const r = await save(1, laptop);
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ version: 2, library: phone });
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await call('GET')).json).toEqual({ version: 2, library: phone });
    // After merging with the copy it was given, the laptop saves on top of it.
    expect((await save(2, laptop)).json).toEqual({ version: 3 });
  });
  it('is refused when a first save meets a library already there', async () => {
    await save(0, LIB);
    const r = await save(0, { lib: [] });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ version: 1, library: LIB });
  });
  it('is refused when it names a version from the future, or one for a library that is not there', async () => {
    await save(0, LIB);
    expect((await save(7, { lib: [] })).json).toEqual({ version: 1, library: LIB });
    const r = await save(3, LIB, { code: OTHER });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ version: 0, library: null });
  });
});

describe('what a PUT must send', () => {
  it('refuses a body that is not {"version", "library"}', async () => {
    const bad = ['', 'not json', '{"version":0,"library":', 'null', '[]', { library: LIB }, { version: 0 }, { version: 0, library: null }];
    for (const body of [
      ...bad,
      { version: 0, library: 'text' },
      { version: '0', library: LIB },
      { version: -1, library: LIB },
      { version: 1.5, library: LIB },
    ]) {
      const r = await call('PUT', { body });
      expect(r.status).toBe(400);
      expect(r.text).toMatch(/"version"/);
    }
    expect(sent).toEqual([]);
  });
  it('refuses a body over the size limit, by its Content-Length or by what arrives', async () => {
    const big = { version: 0, library: { pad: 'x'.repeat(MAX_BYTES) } };
    const length = String(JSON.stringify(big).length);
    for (const headers of [{ 'content-length': length }, {}, { 'content-length': '10' }]) {
      const r = await call('PUT', { body: big, headers });
      expect(r.status).toBe(413);
      expect(r.text).toMatch(/512 KB/);
    }
    expect(sent).toEqual([]);
  });
  it('takes a body right at the limit', async () => {
    const wrap = JSON.stringify({ version: 0, library: { pad: '' } }).length;
    const library = { pad: 'x'.repeat(MAX_BYTES - wrap) };
    expect((await save(0, library)).json).toEqual({ version: 1 });
    expect((await call('GET')).json).toEqual({ version: 1, library });
  });
});

describe('the store', () => {
  it('is asked once per request, with its token, and never given the code', async () => {
    await save(0, LIB);
    await call('GET');
    expect(sent).toHaveLength(2);
    for (const s of sent) {
      expect(s.url).toBe('https://example.upstash.io');
      expect(s.token).toBe('Bearer store-token');
      expect(s.command[0]).toBe('EVAL');
      expect(JSON.stringify(s.command)).not.toContain(CODE);
      expect(JSON.stringify(s.command)).not.toContain('203.0.113.7');
    }
    expect([...redis.keys()].join()).not.toContain(CODE);
    expect(redis.has('sync:' + createHash('sha256').update(CODE).digest('hex'))).toBe(true);
  });
  it('is found under the names Upstash uses outside Vercel too', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://direct.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'direct-token');
    expect((await call('GET')).status).toBe(200);
    expect(sent[0]).toMatchObject({ url: 'https://direct.upstash.io', token: 'Bearer direct-token' });
  });
  it('says how to set sync up when it is not there', async () => {
    vi.unstubAllEnvs();
    for (const r of [await call('GET'), await save(0, LIB)]) {
      expect(r.status).toBe(503);
      expect(r.text).toMatch(/add Upstash Redis/);
    }
    vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
    expect((await call('GET')).status).toBe(503);
    expect(sent).toEqual([]);
  });
  it('failing gives a 502, or a 504 when it does not answer in time', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => new Response('{"error":"WRONGPASS"}', { status: 401 }));
    expect((await call('GET')).status).toBe(502);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    const r = await save(0, LIB);
    expect(r.status).toBe(502);
    expect(r.text).toMatch(/try again later/);
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
    expect((await call('GET')).status).toBe(504);
    expect(log).toHaveBeenCalledTimes(3);
    // What went wrong is in the function's log, not in the answer.
    expect(String(log.mock.calls[0])).toMatch(/WRONGPASS/);
    expect(r.text).not.toMatch(/fetch failed/);
    log.mockRestore();
  });
});

describe('the rate limit', () => {
  it('stops an address after its requests for the minute, saves included', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) expect((await call('GET')).status).toBe(200);
    const r = await call('GET');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBe('60');
    expect(r.text).toMatch(/wait a minute/);
    expect((await save(0, LIB)).status).toBe(429);
    expect((await call('GET', { code: OTHER })).status).toBe(429);
    expect([...redis.keys()].filter((k) => k.startsWith('sync:'))).toEqual([]);
  });
  it('counts each address on its own', async () => {
    for (let i = 0; i <= RATE_LIMIT; i++) await call('GET');
    expect((await call('GET')).status).toBe(429);
    expect((await call('GET', { headers: { 'x-real-ip': '198.51.100.9' } })).status).toBe(200);
  });
  it('reads the address from x-forwarded-for when there is no x-real-ip', async () => {
    const proxied = { 'x-real-ip': '', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
    for (let i = 0; i < RATE_LIMIT; i++) await call('GET', { headers: proxied });
    expect((await call('GET')).status).toBe(429);
  });
});
