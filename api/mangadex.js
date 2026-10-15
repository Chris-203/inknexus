// Vercel Function: relays MangaDex API GET requests for InkNexus, same-origin only.
// Usage from the app: /api/mangadex?url=<encoded https://api.mangadex.org/... URL>
// Browsers block direct calls to the MangaDex API, so the app calls this instead.

const { USER_AGENT, send, sameSite } = require('./_relay');

const UPSTREAM_HOST = 'api.mangadex.org';
const TIMEOUT_MS = 15000;

// The MangaDex URL to relay, or null if it is not an https URL on api.mangadex.org.
function target(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== UPSTREAM_HOST) return null;
  if (u.port || u.username || u.password) return null;
  return u;
}

// How long Vercel's edge cache may share a successful answer. All users reach MangaDex from the relay's few egress IPs,
// under one ~5 requests a second limit per IP, so shared hits are what keep the app under it.
// The edge serves cached answers without running sameSite(), so only public catalog data is cached, and briefly.
// s-maxage plus stale-while-revalidate stays within a day, so a chapter a scanlation group has had removed drops out.
// Never cached: at-home/server, whose page URLs carry short-lived tokens, and anything not listed here.
function cacheFor(u) {
  const p = u.pathname;
  if (p === '/manga') return 'public, max-age=0, s-maxage=60, stale-while-revalidate=120';
  if (/^\/manga\/[0-9a-f-]{36}$/i.test(p)) return 'public, max-age=0, s-maxage=3600, stale-while-revalidate=82800';
  if (/^\/manga\/[0-9a-f-]{36}\/feed$/i.test(p)) return 'public, max-age=0, s-maxage=300, stale-while-revalidate=600';
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
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
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

module.exports.cacheFor = cacheFor;
