import { useApp } from '../context';
import { fmt } from './format';
import { chapterLink, host, nextWhole } from './links';
import { opensInBrowser } from './siteSettings';
import type { Link, Series } from './types';

/** Opens link source `l` in the app, or in the browser for sites set to that: its series page, the chapter after `shown`, or the saved link. */
export function useOpenLink(x: Series, l: Link, i: number, shown: number) {
  const { navigate, toast } = useApp();
  return (mode: 'page' | 'cont' | 'resume') => {
    const site = host(l.url);
    const n = mode === 'cont' ? nextWhole(shown) : mode === 'resume' ? l.rn || 0 : 0;
    const url = mode === 'resume' ? l.resume || '' : n && l.tpl ? chapterLink(l.tpl, n) : '';
    if (opensInBrowser(site)) {
      window.open(url || l.url, '_blank', 'noopener');
      return toast(n ? `Opened chapter ${fmt(n)} in the browser` : 'Opened in the browser', true);
    }
    navigate({ name: 'frame', id: x.id, i, ch: n, url });
  };
}
