// Vercel Function: relays MangaDex API GET requests for InkNexus, same-origin only.
// Usage from the app: /api/mangadex?url=<encoded https://api.mangadex.org/... URL>
// Browsers block direct calls to the MangaDex API, so the app calls this instead.

const UPSTREAM_HOST = 'api.mangadex.org';
const TIMEOUT_MS = 15000;

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

// The MangaDex URL to relay, or null if it is not an https URL on api.mangadex.org.
function target(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.hostname !== UPSTREAM_HOST) return null;
  if (u.port || u.username || u.password) return null;
  return u;
}

function hostOf(v) {
  if (!v) return '';
  try { return new URL(v).host.toLowerCase(); } catch (e) { return ''; }
}

// Only pages on this same site may use the relay.
function sameSite(req) {
  const h = req.headers;
  if (h['sec-fetch-site'] === 'same-origin') return true;
  const self = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim().toLowerCase();
  if (!self) return false;
  return hostOf(h.origin) === self || hostOf(h.referer) === self;
}

// Short shared cache for search and chapter lists only. Never for at-home/server:
// its page URLs carry short-lived tokens.
function cacheFor(u) {
  if (u.pathname === '/manga' || /^\/manga\/[0-9a-f-]{36}\/feed$/i.test(u.pathname))
    return 'public, max-age=0, s-maxage=60, stale-while-revalidate=120';
  return 'no-store';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed: GET only', { Allow: 'GET' });
  if (!sameSite(req)) return send(res, 403, 'Forbidden: same-site requests only');

  const q = new URL(req.url, 'http://localhost').searchParams.get('url');
  const u = target(q);
  if (!u) return send(res, 403, 'Forbidden: only https://api.mangadex.org URLs are relayed');

  let r, body;
  try {
    r = await fetch(u.href, {
      headers: { 'User-Agent': 'InkNexus/1.0', Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    body = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return send(res, timeout ? 504 : 502, timeout ? 'MangaDex did not answer in time' : 'Could not reach MangaDex');
  }

  const headers = { 'Content-Type': r.headers.get('content-type') || 'application/json' };
  const retry = r.headers.get('retry-after');
  if (retry) headers['Retry-After'] = retry;
  headers['Cache-Control'] = r.status === 200 ? cacheFor(u) : 'no-store';
  // MangaDex's status (including 429) goes to the app unchanged.
  return send(res, r.status, body, headers);
};
