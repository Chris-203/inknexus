// Screenshots and GIFs for PR bodies, at 390px with placeholder data. Import it from a short script:
//
//   import { open, gif } from './scripts/pr-media.mjs';
//   const { browser, page } = await open('http://localhost:4173/');
//   await page.screenshot({ path: 'after.png' });
//   await gif(page, 'after.gif', () => page.getByRole('button', { name: 'Settings' }).click());
//   await browser.close();
import { writeFile } from 'node:fs/promises';
import gifenc from 'gifenc';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const TITLES = ['Placeholder One', 'The Long Placeholder Saga', 'Example Series', 'Sample Story', 'Mock Chronicle', 'Last Placeholder'];

/** A library of made-up series with link sources, so no real titles or covers show. */
export const PLACEHOLDER_LIB = TITLES.map((title, i) => ({
  id: 'p' + i,
  title,
  cover: '',
  md: null,
  al: null,
  links: [{ label: 'Site', url: 'https://example.com/' }],
  last: (i * 7) % 40,
  t: 100 - i,
}));

const BLANK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 3"><rect width="2" height="3" fill="#8a8a96"/></svg>';

/**
 * Opens `url` in Chrome at 390 by 844 with `lib` as the library when none is saved yet. Images from
 * other sites and the MangaDex image relay are replaced with a gray box, so no real covers or pages show.
 */
export async function open(url, lib = PLACEHOLDER_LIB) {
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const site = new URL(url).origin;
  await page.addInitScript((saved) => localStorage.getItem('longstrip') || localStorage.setItem('longstrip', saved), JSON.stringify({ lib }));
  await page.route(
    (u) => u.origin !== site || u.pathname.startsWith('/api/mdimage'),
    (r) => (r.request().resourceType() === 'image' ? r.fulfill({ contentType: 'image/svg+xml', body: BLANK }) : r.continue()),
  );
  await page.goto(url);
  return { browser, page };
}

/** Records the page into a GIF at 1x while `act` runs and for `tail` ms after, with each frame shown for as long as it was on screen. */
export async function gif(page, file, act, tail = 600) {
  const frames = [];
  let done = false;
  const acting = act().finally(() => setTimeout(() => (done = true), tail));
  while (!done) frames.push({ png: await page.screenshot({ scale: 'css' }), at: Date.now() });
  await acting;
  const out = GIFEncoder();
  frames.forEach(({ png, at }, i) => {
    const { data, width, height } = PNG.sync.read(png);
    const palette = quantize(data, 256);
    const delay = (frames[i + 1]?.at ?? at + 1000) - at;
    out.writeFrame(applyPalette(data, palette), width, height, { palette, delay });
  });
  out.finish();
  await writeFile(file, out.bytes());
}
