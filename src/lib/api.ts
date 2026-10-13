/** Same-origin Vercel Function (api/mangadex.js) that relays MangaDex API GETs. */
export const RELAY = '/api/mangadex';
export const MD = 'https://api.mangadex.org';
/** Same-origin Vercel Function (api/mdimage.js) that relays MangaDex page images and covers: MangaDex requires apps to proxy them. */
export const IMAGE_RELAY = '/api/mdimage';

/** Where to load an image from: MangaDex images go through the image relay, any other address is used as is. */
export function imageSrc(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;
  }
  const md = host === 'uploads.mangadex.org' || host.endsWith('.mangadex.network');
  return md ? `${IMAGE_RELAY}?url=${encodeURIComponent(url)}` : url;
}

export function apiHint(status: number): string {
  if (status === 429) return 'MangaDex is rate-limiting, wait a minute and try again';
  if (status === 403) return 'request refused; reload the page and try again';
  if (status === 404) return 'not found on MangaDex';
  if (status >= 500) return 'MangaDex or the relay is down, try again later';
  return 'try again later';
}

/** GET a MangaDex API URL through the relay. Errors say what failed and what to try, and carry the HTTP status. */
export async function api(url: string): Promise<Response> {
  let r: Response;
  try {
    // The page sends no Referer by default. The relay falls back to the Referer on browsers without
    // Sec-Fetch-Site (Safari before 16.4), so send it to our own origin.
    r = await fetch(`${RELAY}?url=${encodeURIComponent(url)}`, { referrerPolicy: 'same-origin' });
  } catch {
    throw new Error('network error; check your connection and try again');
  }
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}: ${apiHint(r.status)}`), { status: r.status });
  return r;
}

export function why(e: unknown): string {
  return (e instanceof Error && e.message) || 'unknown error';
}

export function statusOf(e: unknown): number | undefined {
  return (e as { status?: number } | null)?.status;
}
