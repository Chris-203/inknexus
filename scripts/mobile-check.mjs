// Checks the Mobile first rules in CLAUDE.md on each main screen in WebKit (Safari's engine) as an iPhone 14, with
// reduced motion on, and saves a screenshot of each to mobile-check/ (git-ignored). Not part of the app or the build.
//
//   npm run build && npx vite preview --port 4173   the screens that need no MangaDex
//   vercel dev                                       the screens that load MangaDex, on port 3000
//   npm run mobile-check
//
// Other addresses: APP_URL=http://localhost:4173 MD_URL=http://localhost:3000 npm run mobile-check
// A screen whose server is not running is skipped. Install WebKit once with
// `npx playwright@<the playwright-core version in package.json> install webkit`.
import { mkdir } from 'node:fs/promises';
import { open, PLACEHOLDER_LIB } from './pr-media.mjs';

const APP = process.env.APP_URL || 'http://localhost:4173';
const MD = process.env.MD_URL || 'http://localhost:3000';
const OUT = 'mobile-check';
// A MangaDex series with a chapter 56 in English, for the reader.
const READER = { md: 'f26c0ae5-c8f6-4630-979e-9a5d310bd795', n: 56 };
const MD_LIB = [{ ...PLACEHOLDER_LIB[0], id: 'mdcheck', md: READER.md, links: [] }, ...PLACEHOLDER_LIB.slice(1)];
const MIN_TARGET = 44;
const MIN_TEXT = 16;
const MAX_TABS = 60;
// Animated properties that move or resize something; with reduced motion on they should not take time. Fades are fine.
const MOTION = /^(transform|translate|scale|rotate|left|right|top|bottom|inset|margin|width|height|max-height)/;

const SCREENS = [
  { name: 'library-cards', server: APP, go: (page) => page.locator('.card').first().waitFor() },
  {
    name: 'library-list',
    server: APP,
    go: async (page) => {
      await page.getByRole('group', { name: 'Show series as' }).getByRole('button', { name: 'List' }).first().click();
      await page.locator('.lrow').first().waitFor();
    },
  },
  {
    name: 'settings',
    server: APP,
    go: async (page) => {
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('dialog').waitFor();
    },
  },
  {
    name: 'series',
    server: MD,
    go: async (page) => {
      await page.locator('.card').nth(1).click();
      await page.getByRole('heading').first().waitFor();
    },
  },
  {
    name: 'browse',
    server: MD,
    go: async (page) => {
      await page.getByRole('button', { name: 'Browse' }).click();
      await page
        .getByRole('button', { name: /^More about / })
        .first()
        .waitFor();
    },
  },
  {
    name: 'browse-result',
    server: MD,
    go: async (page) => {
      await page.getByRole('button', { name: 'Browse' }).click();
      await page
        .getByRole('button', { name: /^More about / })
        .first()
        .click();
      await page.getByRole('heading').first().waitFor();
    },
  },
  {
    name: 'reader',
    server: MD,
    go: async (page) => {
      // Once My Series shows, the app has recorded its first view, so this one is not overwritten.
      await page.locator('.card').first().waitFor();
      await page.evaluate((v) => history.replaceState({ v, back: false }, ''), { name: 'reader', id: 'mdcheck', n: READER.n });
      await page.reload();
      await page.locator('#strip').waitFor();
    },
  },
];

/** Records CSS animations and transitions as they start, with their duration and whether they move something. */
function watchMotion() {
  window.__motion = [];
  const where = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : ''));
  const seconds = (list, i) => parseFloat(list.split(',')[i] ?? list.split(',')[0]) * (list.includes('ms') ? 0.001 : 1);
  document.addEventListener(
    'animationstart',
    (e) => {
      const s = getComputedStyle(e.target);
      const i = s.animationName
        .split(',')
        .map((n) => n.trim())
        .indexOf(e.animationName);
      const anim = e.target.getAnimations().find((a) => a.animationName === e.animationName);
      const props = anim ? [...new Set(anim.effect.getKeyframes().flatMap(Object.keys))] : [];
      window.__motion.push({ what: `animation ${e.animationName}`, props, s: seconds(s.animationDuration, i), where: where(e.target) });
    },
    true,
  );
  document.addEventListener(
    'transitionrun',
    (e) => {
      const s = getComputedStyle(e.target);
      const names = s.transitionProperty.split(',').map((n) => n.trim());
      const i = Math.max(names.indexOf(e.propertyName), names.indexOf('all'));
      window.__motion.push({ what: `transition`, props: [e.propertyName], s: seconds(s.transitionDuration, i), where: where(e.target) });
    },
    true,
  );
}

/** The layout checks, run in the page. */
function layout({ MIN_TARGET, MIN_TEXT }) {
  const where = (el) => {
    const name = el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30) || el.getAttribute('placeholder') || '';
    const tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].join('.') : '');
    return name ? `${tag} "${name}"` : tag;
  };
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert],[aria-hidden="true"]');
  };
  const vw = document.documentElement.clientWidth;
  const sideways = [];
  if (document.scrollingElement.scrollWidth > vw) {
    sideways.push(`page is ${document.scrollingElement.scrollWidth}px wide in a ${vw}px viewport`);
    // What sticks out, outside any box that scrolls or clips sideways on its own.
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || el.getBoundingClientRect().right <= vw + 1) continue;
      let p = el.parentElement;
      while (p && p !== document.body && getComputedStyle(p).overflowX === 'visible') p = p.parentElement;
      if (p === document.body || !p) sideways.push(`${where(el)} reaches ${Math.round(el.getBoundingClientRect().right)}px`);
    }
  }
  // A tap's target is what the browser hits there, so this counts a ::before that widens a button, and the label of
  // an input, as the app does. A control whose middle is covered (behind a sheet) cannot be tapped and is left out.
  const hits = (el, x, y) => {
    const t = document.elementFromPoint(x, y);
    return !!t && (el.contains(t) || [...(el.labels || [])].some((l) => l.contains(t)));
  };
  const reach = (el, x, y, dx, dy) => {
    let d = 0;
    while (d < MIN_TARGET && hits(el, x + dx * (d + 1), y + dy * (d + 1))) d++;
    return d;
  };
  const small = [];
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), textarea, select, summary, [role=button]')) {
    if (!shown(el)) continue;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (!hits(el, x, y)) continue;
    const w = reach(el, x, y, -1, 0) + reach(el, x, y, 1, 0) + 1;
    const h = reach(el, x, y, 0, -1) + reach(el, x, y, 0, 1) + 1;
    if (w < MIN_TARGET || h < MIN_TARGET) small.push(`${where(el)} can be tapped in ${Math.round(w)}x${Math.round(h)}`);
  }
  scrollTo(0, 0);
  const text = [];
  for (const el of document.querySelectorAll('input, textarea')) {
    if (!shown(el) || /^(checkbox|radio|range|file|button|submit|reset|color|hidden)$/.test(el.type)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < MIN_TEXT) text.push(`${where(el)} has ${size}px text`);
  }
  return { sideways, small, text };
}

/** Tabs through the controls and lists each one whose look does not change when it has focus. */
async function focusCheck(page) {
  const look = (el) => {
    const s = getComputedStyle(el);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.textDecorationLine].join('|');
  };
  const stops = [];
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const el = await page.evaluateHandle(() => document.activeElement);
    if (await el.evaluate((e) => e === document.body || e === null)) continue;
    if (stops.length && (await el.evaluate((e, first) => e === first, stops[0].el))) break;
    stops.push({
      el,
      focused: await el.evaluate(look),
      label: await el.evaluate((e) => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 30) || e.tagName.toLowerCase()),
    });
  }
  await page.evaluate(() => document.activeElement?.blur());
  const failed = [];
  for (const s of stops) if ((await s.el.evaluate(look)) === s.focused) failed.push(`"${s.label}" looks the same with focus`);
  return { failed, count: stops.length };
}

async function reachable(url) {
  return fetch(url).then(
    (r) => r.ok,
    () => false,
  );
}

async function check(screen) {
  const { browser, page } = await open(screen.server, screen.server === MD ? MD_LIB : PLACEHOLDER_LIB, {
    browser: 'webkit',
    reducedMotion: 'reduce',
    // The service worker fetches images where the gray boxes cannot replace them.
    serviceWorkers: 'block',
  });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  // Requests cut off by leaving a page or by the app itself are not failures.
  page.on('requestfailed', (r) => /cancel|abort/i.test(r.failure()?.errorText) || errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`request failed: ${r.url()} (${r.status()})`));
  await page.addInitScript(watchMotion);
  await page.reload();
  let opened = [];
  try {
    await screen.go(page);
    // Let what the screen loads arrive and its animations finish.
    await page.waitForTimeout(1500);
  } catch (e) {
    opened = [e.message.split('\n')[0]];
  }
  await page.screenshot({ path: `${OUT}/${screen.name}.png` });
  const { sideways, small, text } = await page.evaluate(layout, { MIN_TARGET, MIN_TEXT });
  const motion = (await page.evaluate(() => window.__motion))
    .filter((m) => m.s > 0.01 && m.props.some((p) => MOTION.test(p)))
    .map((m) => `${m.what} of ${m.props.filter((p) => MOTION.test(p)).join(', ')} on ${m.where} takes ${m.s}s`);
  const focus = await focusCheck(page);
  await browser.close();
  return {
    'screen opened': opened,
    'no sideways scrolling': sideways,
    'touch targets at least 44x44': small,
    'inputs at 16px text or larger': text,
    [`visible focus (${focus.count} tab stops)`]: focus.failed,
    'no console errors or failed requests': [...new Set(errors)],
    'nothing moves with reduced motion': [...new Set(motion)],
  };
}

await mkdir(OUT, { recursive: true });
let failures = 0;
for (const screen of SCREENS) {
  if (!(await reachable(screen.server))) {
    console.log(`\n${screen.name}: SKIPPED, nothing answers at ${screen.server}`);
    continue;
  }
  console.log(`\n${screen.name} (${screen.server}), screenshot ${OUT}/${screen.name}.png`);
  for (const [rule, failed] of Object.entries(await check(screen))) {
    console.log(`  ${failed.length ? 'FAIL' : 'pass'}  ${rule}`);
    for (const f of failed) console.log(`        ${f}`);
    failures += failed.length ? 1 : 0;
  }
}
console.log(`\n${failures ? `${failures} failed checks` : 'All checks passed'}`);
process.exitCode = failures ? 1 : 0;
