// Cloudflare Worker: relays MangaDex API requests for InkNexus.
// Put your deployed site address(es) in ALLOWED. Requests from any other website are refused.
// Note: opening the worker URL directly in a browser tab also shows "blocked" (no Origin header). That is expected.
const ALLOWED = [
  "https://YOUR-SITE.vercel.app",
];

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    if (!ALLOWED.includes(origin)) return new Response("blocked", { status: 403 });
    const t = new URL(req.url).searchParams.get("url");
    if (!t || !t.startsWith("https://api.mangadex.org/"))
      return new Response("blocked", { status: 403 });
    const r = await fetch(t, { headers: { "User-Agent": "InkNexus/1.0" } });
    const h = new Headers(r.headers);
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    return new Response(r.body, { status: r.status, headers: h });
  },
};
