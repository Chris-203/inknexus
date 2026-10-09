import type { SearchResult } from '../lib/types';

interface AlMedia {
  id: number;
  title: { romaji?: string; english?: string | null };
  coverImage?: { large?: string };
  description?: string | null;
  externalLinks?: { site: string; url: string; type?: string; language?: string | null }[];
}

/** AniList search: metadata plus official English reading links (Webtoon links skipped). */
export async function search(q: string): Promise<SearchResult[]> {
  const query = `query($q:String){Page(perPage:15){media(search:$q,type:MANGA,sort:SEARCH_MATCH){id title{romaji english} coverImage{large} description(asHtml:false) externalLinks{site url type language}}}}`;
  let r: Response;
  try {
    r = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { q } }),
    });
  } catch {
    throw new Error('network error; check your connection and try again');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 429 ? ': AniList is rate-limiting, wait a minute and try again' : ''}`);
  const j: { data: { Page: { media: AlMedia[] } } } = await r.json();
  return j.data.Page.media.map((m) => ({
    src: 'al',
    ref: m.id,
    title: m.title.english || m.title.romaji || 'Untitled',
    cover: m.coverImage?.large || '',
    desc: (m.description || '').replace(/<[^>]+>/g, ''),
    links: (m.externalLinks || [])
      .filter((l) => l.type === 'STREAMING' && (!l.language || l.language === 'English') && !/webtoon/i.test(l.site))
      .map((l) => ({ label: l.site, url: l.url })),
  }));
}
