import { imageSrc } from '../lib/api';

/** The covers that have loaded, by address. */
const loaded = new Set<string>();

/**
 * A series' cover in My Series. One that has loaded before loads at once wherever it shows again, as on the shelf a
 * series was moved to, rather than waiting until it scrolls into view and showing a gray box until then.
 */
export function ShelfCover({ url }: { url: string }) {
  const src = imageSrc(url);
  return <img src={src} referrerPolicy="same-origin" loading={loaded.has(src) ? 'eager' : 'lazy'} onLoad={() => loaded.add(src)} alt="" />;
}
