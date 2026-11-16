// Vercel Function: keeps a library for device sync in Upstash Redis, same-origin only.
// The sync code goes in "Authorization: Bearer <code>", never in the address, which Vercel logs.
//   GET /api/sync answers {"version": 3, "library": {...}}, or {"version": 0, "library": null} before the first save.
//   PUT /api/sync with {"version": 3, "library": {...}} saves the library as version 4 and answers {"version": 4}.
// A PUT names the version it was based on. When another device has saved since, nothing is saved and the answer is
// 409 with the current {"version", "library"}, for the app to merge and send again.
// The library is kept as sent and never read here. It is stored under a hash of the code, never the code itself.

const { createHash } = require('node:crypto');
const { send, sameSite } = require('./_relay');

const MAX_BYTES = 512 * 1024;
const RATE_LIMIT = 60;
const RATE_SECONDS = 60;
const TIMEOUT_MS = 10000;

// Each request is one script, so Redis runs it as a whole: no other device's save can land between the version check
// and the save. Both scripts first count the request against its IP address (KEYS[1]); the library is KEYS[2].
const COUNT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if n > tonumber(ARGV[2]) then return {'limit', redis.call('TTL', KEYS[1])} end
`;
const LOAD = `${COUNT}
local x = redis.call('HMGET', KEYS[2], 'v', 'data')
return {'ok', tonumber(x[1] or 0), x[2]}
`;
const SAVE = `${COUNT}
local v = tonumber(redis.call('HGET', KEYS[2], 'v') or 0)
if v ~= tonumber(ARGV[3]) then return {'stale', v, redis.call('HGET', KEYS[2], 'data')} end
redis.call('HSET', KEYS[2], 'v', v + 1, 'data', ARGV[4])
return {'ok', v + 1}
`;

function hash(s) {
  return createHash('sha256').update(s).digest('hex');
}

// Where Upstash Redis is, from the variables its Vercel integration adds, or null before it is added.
function store() {
  const e = process.env;
  const url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL;
  const token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

// Run a script in Upstash Redis over its REST API.
async function run({ url, token }, script, keys, args) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', script, keys.length, ...keys, ...args]),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`Upstash answered HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()).result;
}

// The request body as text, or null when it is larger than MAX_BYTES.
// Read from 'data' events, which Vercel's body helpers replay after reading the body themselves.
function bodyOf(req) {
  if (Number(req.headers['content-length']) > MAX_BYTES) return null;
  return new Promise((resolve) => {
    const parts = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BYTES) parts.push(c);
    });
    req.on('end', () => resolve(size > MAX_BYTES ? null : Buffer.concat(parts).toString()));
    // A body cut off part way fails as JSON below.
    req.on('error', () => resolve(''));
  });
}

// What a PUT asks to save: the version it was based on and the library as JSON text. Otherwise why it is refused.
async function saveOf(req) {
  const text = await bodyOf(req);
  if (text === null) return { status: 413, error: `Library too large: sync holds up to ${MAX_BYTES / 1024} KB` };
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    b = null;
  }
  if (!b || !Number.isSafeInteger(b.version) || b.version < 0 || !b.library || typeof b.library !== 'object')
    return { status: 400, error: 'Bad request: send {"version": <the version this save is based on>, "library": {...}}' };
  return { version: b.version, data: JSON.stringify(b.library) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PUT') return send(res, 405, 'Method not allowed: GET and PUT only', { Allow: 'GET, PUT' });
  if (!sameSite(req)) return send(res, 403, 'Forbidden: same-site requests only');

  const code = /^Bearer ([\w-]{20,128})$/.exec(req.headers.authorization || '')?.[1];
  if (!code) return send(res, 401, 'Sync code missing or not valid: send "Authorization: Bearer <code>", with a code of 20 to 128 letters, digits, - or _');

  const save = req.method === 'PUT' ? await saveOf(req) : null;
  if (save?.error) return send(res, save.status, save.error);

  const at = store();
  if (!at) return send(res, 503, 'Sync is not set up: add Upstash Redis to the Vercel project under Storage, connected to this environment');

  // Vercel sets these headers itself, so a page cannot pick its own address.
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  const keys = [`rate:${hash(ip)}`, `sync:${hash(code)}`];
  const limits = [RATE_SECONDS, RATE_LIMIT];
  let state, v, data;
  try {
    [state, v, data] = await (save ? run(at, SAVE, keys, [...limits, save.version, save.data]) : run(at, LOAD, keys, limits));
  } catch (e) {
    console.error('sync:', e);
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return send(
      res,
      timeout ? 504 : 502,
      timeout ? 'The sync store did not answer in time, try again later' : 'Could not reach the sync store, try again later',
    );
  }

  if (state === 'limit') return send(res, 429, 'Too many sync requests: wait a minute and try again', { 'Retry-After': String(Math.max(1, v)) });
  const json = { 'Content-Type': 'application/json' };
  if (save && state === 'ok') return send(res, 200, `{"version":${Number(v)}}`, json);
  // The saved library is already JSON text, so it goes out as it came in.
  return send(res, state === 'stale' ? 409 : 200, `{"version":${Number(v)},"library":${data || 'null'}}`, json);
};

module.exports.MAX_BYTES = MAX_BYTES;
module.exports.RATE_LIMIT = RATE_LIMIT;
