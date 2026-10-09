/** Same-origin Vercel Function (api/mangadex.js) that relays MangaDex API GETs. */
export const RELAY = '/api/mangadex';
export const MD = 'https://api.mangadex.org';

export function apiHint(status: number): string {
  if (status === 429) return 'MangaDex is rate-limiting, wait a minute and try again';
  if (status === 403) return 'request refused; reload the page and try again';
  if (status === 404) return 'not found on MangaDex';
  if (status >= 500) return 'MangaDex or the relay is down, try again later';
  return 'try again later';
}

/** GET a MangaDex API URL through the relay. Errors say what failed and what to try. */
export async function api(url: string): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${RELAY}?url=${encodeURIComponent(url)}`);
  } catch {
    throw new Error('network error; check your connection and try again');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${apiHint(r.status)}`);
  return r;
}

export const why = (e: unknown): string => (e instanceof Error && e.message) || 'unknown error';
