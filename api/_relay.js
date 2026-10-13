// Helpers shared by the relays in api/. Vercel does not deploy files starting with _ as functions.

// MangaDex requires an honest User-Agent on every request.
const USER_AGENT = 'InkNexus/1.0';

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function hostOf(v) {
  if (!v) return '';
  try {
    return new URL(v).host.toLowerCase();
  } catch {
    return '';
  }
}

// Only pages on this same site may use the relay.
function sameSite(req) {
  const h = req.headers;
  if (h['sec-fetch-site'] === 'same-origin') return true;
  const self = String(h['x-forwarded-host'] || h.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (!self) return false;
  return hostOf(h.origin) === self || hostOf(h.referer) === self;
}

module.exports = { USER_AGENT, send, sameSite };
