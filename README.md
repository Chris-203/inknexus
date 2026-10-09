# InkNexus

**Every series. One place.**

![InkNexus](assets/cover.png)

A mobile-first webtoon and manhwa tracker and reader that runs in the browser and can be added to your home screen.

- **Library** with cover grid and last-chapter-read tracking
- **Multiple sources per series**: switch between them, hide the ones you don't use, and the app remembers your pick
- **Built-in reader** (vertical scroll) for MangaDex chapters, with sort, official-site chapters marked, scanlation groups credited, and pinch or double-tap zoom on the pages
- **AniList search** for metadata and official English reading links
- **Link-only sources** for any other site: paste a chapter link and the app reads the chapter number, learns the URL pattern where possible, and offers Continue / Next
- Export and import your library as JSON

InkNexus does not host, scrape or copy chapter images from sites that don't offer an API. Other sites are added as links you open yourself.

## Run it

A React + TypeScript app built with Vite, plus the MangaDex relay in `api/`.

```
npm install
npm run dev        # the app at http://localhost:5173 (MangaDex search needs `vercel dev`, see below)
npm test           # unit tests
npm run build      # production build into dist/
```

### Vercel
1. Push this repo to GitHub.
2. On vercel.com choose Add New > Project, import the repo. `vercel.json` sets the Vite build, so no settings need changing.
3. Every pull request gets a preview deployment.

### MangaDex relay
Browsers block direct calls to the MangaDex API, so `api/mangadex.js`, a Vercel Function deployed with the site, relays them at `/api/mangadex`. It works on production and on every preview with no setup. It only forwards GET requests to `https://api.mangadex.org`, and only for pages on the same site. Chapter images load directly from MangaDex, not through the relay.

To try MangaDex locally, use `vercel dev`, which runs the app and the relay together. `npm run dev` serves only the app, so MangaDex search there fails with HTTP 404.

## Data
Your library is stored in your browser's local storage, separately for each browser and each installed home-screen shortcut. Use Export backup regularly and Import to move a library between browsers.
