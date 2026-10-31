import { useLoad } from '../lib/useLoad';
import * as anilist from '../sources/anilist';

/** The trailer AniList has for series `al` or its anime, played on the page. Nothing shows without an id or when AniList has no trailer. */
export function Trailer({ al }: { al: number | null | undefined }) {
  const trailer = useLoad(al ? `trailer:${al}` : null, () => anilist.trailer(al!));
  if (trailer?.state === 'error') return <p className="sub">Could not check AniList for a trailer ({trailer.error}). Go back and open this series again.</p>;
  if (trailer?.state !== 'done' || !trailer.value) return null;
  return (
    <section className="trailer" aria-label="Trailer">
      <h3>Trailer</h3>
      {trailer.value.title && <p className="sub">{trailer.value.title}</p>}
      {/* YouTube's player refuses to play without the page's origin as referrer, which the app otherwise never sends. */}
      <iframe
        src={trailer.value.embed}
        title={`Trailer on ${trailer.value.site}`}
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </section>
  );
}
