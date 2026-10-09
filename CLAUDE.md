# InkNexus

Every series. One place. A mobile-first webtoon and manhwa tracker and reader.
A React + TypeScript web app built with Vite. Deployed on Vercel at https://inknexus-psi.vercel.app.

## Workflow
- `main` is protected. Every change goes through a branch and a pull request. Do not push to `main`.
- Each PR gets a Vercel preview. Check the change there, at phone width, before merging.
- Keep PRs small and single-purpose. Refactors that change no behavior get their own PR.

## Check before committing
Run all three; the GitHub "Check" action runs them on every PR too:

```
npm run typecheck
npm test
npm run build
```

`npm run dev` serves the app locally, but without `/api/mangadex`; use `vercel dev` to try MangaDex locally.

## Layout
- `index.html`: the page shell and meta tags; the app mounts on `#root` from `src/main.tsx`
- `src/App.tsx`: views, bottom nav, toast, backup import. Views live in browser history (`navigate()` in `src/context.ts`), so the phone back gesture works
- `src/views/`: one file per screen: `Library`, `Search`, `Series` (with the add-source and rename sheets), `Reader`, `Frame`
- `src/components/`: `Sheet` (bottom sheet), `LinkFields` (site presets and link fields)
- `src/lib/`: `store.ts` (the library, saved on every change), `storage.ts` (the `longstrip` key, backups), `api.ts` (`api()` and `RELAY`), `links.ts` (`parseChUrl()`, `PRESETS`), `names.ts` (title choice), `chapters.ts` (session chapter cache), `zoom.ts` (reader pinch and double-tap), `types.ts`
- `src/sources/`: `mangadex.ts` and `anilist.ts`. `toChapterList()` is the chapter filter
- `*.test.ts`: Vitest unit tests next to the code they test
- `src/styles.css`: all styles
- `api/mangadex.js`: Vercel Function that relays MangaDex API GETs (CORS workaround) at `/api/mangadex`, limited to `https://api.mangadex.org` and same-site requests
- `assets/`: cover art (`cover.svg` is the source, `cover.png` is rendered from it)
- `public/`: icons (`favicon.svg`, `apple-touch-icon.png`), copied as-is into the build
- `vercel.json`: builds with Vite into `dist/`

Library data uses the field names in `src/lib/types.ts` (`Series`, `Link`); they match what is already saved in people's browsers, so do not rename them without a migration.

## Rules
- **Storage key stays `longstrip`.** It predates the rename. Changing it makes every saved library look empty. If it ever must change, migrate the old key.
- **The relay stays narrow.** `api/mangadex.js` forwards GET only, only to `https://api.mangadex.org` (checked with `new URL()`, not string prefixes), and only for same-site requests. Never turn it into an open proxy, add CORS headers, or relay image hosts or other sites. No secrets or hardcoded site addresses in the repo.
- **Sources policy.** The built-in reader is only for sources with an API that allows it (MangaDex, under its API rules). Everything else is link-only: the user pastes a chapter link and the app reads the chapter number. For unlicensed scanlation sites the app may know a site's name and main address (for example to prefill a link), and may open the site's own page, but it must never fetch, scrape, mirror, proxy or hotlink their pages or images, and never read their chapters inside the app's reader.
- **Original artwork only.** Do not add real covers, characters or logos. Cover art in `assets/` is original.
- **Mobile first.** Check at about 390px wide. Keep visible focus states, keep touch targets large, respect `prefers-reduced-motion`. The app itself does not pinch-zoom (`touch-action` on `body`); only the reader's pages zoom, through `src/lib/zoom.ts`. Inputs stay at 16px text so iOS does not zoom on focus.
- **Failure messages say what failed and what to do.** Do not swallow errors silently.

## Planned
- "New chapter" badges in the library for MangaDex series with chapters past the last one read.
- Possibly: offline support (a service worker), and a text-size setting since the interface no longer pinch-zooms.
