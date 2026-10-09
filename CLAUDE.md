# InkNexus

Every series. One place. A mobile-first webtoon and manhwa tracker and reader.
A static web app: no build step, no framework. Deployed on Vercel at https://inknexus-psi.vercel.app.

## Workflow
- `main` is protected. Every change goes through a branch and a pull request. Do not push to `main`.
- Each PR gets a Vercel preview. Check the change there, at phone width, before merging.
- Keep PRs small and single-purpose. Refactors that change no behavior get their own PR.

## Commits and PRs
- Branch names start with `chris/`, for example `chris/fix-add-link-overflow`.
- No `Co-Authored-By` trailer or other attribution lines in commit messages.
- PR bodies are plain text, no markdown. Four parts: what changed, why, how to test, how it was tested.
- No mention of Claude Code, sessions or session links in commits or PR bodies.
- Include screenshots or other media of the change in the PR body when there is anything visible to show.

## Check before committing
The whole app lives in one inline script, so a syntax error blanks the page. Run:

```
node -e "const s=require('fs').readFileSync('index.html','utf8');const m=s.match(/<script>([\s\S]*)<\/script>/)[1];new Function(m);console.log('syntax ok')"
```

## Layout
- `index.html`: markup, CSS and all JS in one file
- `worker/worker.js`: Cloudflare Worker that relays MangaDex API calls (CORS workaround), locked to `ALLOWED` origins
- `assets/`: cover art (`cover.svg` is the source, `cover.png` is rendered from it)
- `favicon.svg`, `apple-touch-icon.png`: icons

Where things are in `index.html`: `Sources` (MangaDex and AniList), `api()` and `DEFAULT_PROXY` (proxy-aware fetch), `parseChUrl()` (chapter number and URL pattern from a pasted link), the views `vLibrary`, `vSearch`, `vSeries`, `vReader`, `vFrame`, and one delegated click handler keyed on `data-a` attributes. State is the object `S`, saved to localStorage.

## Rules
- **Storage key stays `longstrip`.** It predates the rename. Changing it makes every saved library look empty. If it ever must change, migrate the old key.
- **No proxy or worker address in the repo.** The repo is public. Each device gets its proxy from a one-time `https://<site>/#proxy=<worker url>` link, and backups never include it.
- **Sources policy.** The built-in reader is only for sources with an API that allows it (MangaDex, under its API rules). Everything else is link-only: the user pastes a chapter link and the app reads the chapter number. Do not scrape, mirror or hotlink pages or images from unlicensed scanlation sites, and do not hardcode their domains.
- **Original artwork only.** Do not add real covers, characters or logos. Cover art in `assets/` is original.
- **Mobile first.** Check at about 390px wide. Keep visible focus states, keep touch targets large, respect `prefers-reduced-motion`.
- **Failure messages say what failed and what to do.** Do not swallow errors silently.

## Planned
- Replace the Cloudflare Worker with a Vercel function (for example `api/mangadex.js`) so the proxy is same-origin: no setup link, no `ALLOWED` list, previews work. Keep it limited to `api.mangadex.org` and same-site requests. Then remove `worker/` and the `#proxy=` flow.
- Likely direction, not decided: split `index.html` into plain ES modules and a CSS file first, and move to Vite only if a build step starts to pay off (offline support, TypeScript, tests).
