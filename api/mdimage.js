// Vercel Function: relays MangaDex page images and covers for InkNexus, same-origin only.
// Usage from the app: /api/mdimage?url=<encoded MangaDex image URL>
// MangaDex requires apps to proxy their users' requests (https://api.mangadex.org/docs/2-limitations/): an image
// loaded straight from another site is refused unless MangaDex already has it cached.

const { USER_AGENT, send, sameSite } = require('./_relay');

const TIMEOUT_MS = 20000;
// Vercel Functions cannot send a larger response body.
const MAX_BYTES = 4.5 * 1024 * 1024;
const REPORT_URL = 'https://api.mangadex.network/report';

// The image URL to relay, or null unless it is an https page image on a MangaDex@Home server
// (a .mangadex.network host, any port) or a page or cover on uploads.mangadex.org.
function target(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.search) return null;
  const page = /^\/(?:[^/]+\/)?(?:data|data-saver)\/[0-9a-f]+\/[^/]+$/.test(u.pathname);
  if (u.hostname.endsWith('.mangadex.network')) return page ? u : null;
  if (u.hostname === 'uploads.mangadex.org' && !u.port) return page || /^\/covers\/[0-9a-f-]{36}\/[^/]+$/.test(u.pathname) ? u : null;
  return null;
}

// MangaDex asks apps to report every image from a MangaDex@Home server, success or not, so it can steer readers to
// healthy servers. Images from mangadex.org itself are not reported.
async function report(u, success, bytes, duration, cached) {
  if (!u.hostname.endsWith('.mangadex.network')) return;
  try {
    await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ url: u.href, success, bytes, duration, cached }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // A lost report must not cost the reader the page.
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed: GET only', { Allow: 'GET' });
  if (!sameSite(req)) return send(res, 403, 'Forbidden: same-site requests only');

  const u = target(new URL(req.url, 'http://localhost').searchParams.get('url'));
  if (!u) return send(res, 403, 'Forbidden: only MangaDex page images and covers are relayed');

  const start = Date.now();
  let r, body;
  try {
    r = await fetch(u.href, { headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    body = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    const timeout = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    send(res, timeout ? 504 : 502, timeout ? 'MangaDex did not answer in time' : 'Could not reach MangaDex');
    return report(u, false, 0, Date.now() - start, false);
  }

  const type = r.headers.get('content-type') || '';
  const ok = r.status === 200 && type.startsWith('image/') && body.length > 0 && body.length <= MAX_BYTES;
  if (ok) {
    // Page and cover file names carry a content hash, so a good image never changes: browsers and Vercel's edge keep it.
    send(res, 200, body, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable' });
  } else {
    send(res, 502, r.status === 200 ? 'MangaDex sent no usable image' : `MangaDex answered ${r.status}`);
  }
  return report(u, ok, body.length, Date.now() - start, (r.headers.get('x-cache') || '').startsWith('HIT'));
};

module.exports.target = target;
