import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useApp } from '../context';
import { AddByLinkSheet } from '../components/AddByLinkSheet';
import { ReadButton } from '../components/ReadButton';
import { Sheet, useDialogFocus, useSheet } from '../components/Sheet';
import { ThemePicker } from '../components/ThemePicker';
import { WebtoonSheet } from '../components/WebtoonSheet';
import { imageSrc } from '../lib/api';
import { backupStatus, saveBackup, useLastBackup } from '../lib/backup';
import { loadChapters, prefetchChapters, useChapterState } from '../lib/chapters';
import { keepCovers } from '../lib/covers';
import { removeAllDownloads, removeDownload, useDownloads } from '../lib/downloads';
import { daysAgo, fileSize, fmt, plural } from '../lib/format';
import { SHELVES, setLibraryShelf, type LibraryTab, setLibraryView, shelfOf, useLibraryShelf, useLibraryView } from '../lib/libraryView';
import { nextWhole } from '../lib/links';
import { useOpenLink } from '../lib/openLink';
import { continueChapter } from '../lib/preload';
import { setShowsReadingUpdates, useShowsReadingUpdates } from '../lib/readingUpdates';
import { shareSeries } from '../lib/share';
import { leftChapter } from '../lib/spots';
import { removeSeries, setShelf, shownSource, useStore } from '../lib/store';
import { pastSlop, useSwipe } from '../lib/swipe';
import type { Link, Series as SeriesT, Shelf } from '../lib/types';
import { checkUpdates, latestFor, newCount, useUpdates } from '../lib/updates';

export function Library() {
  const { navigate, importBackup, toast } = useApp();
  const { lib } = useStore();
  const list = [...lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const mds = list.flatMap((x) => (x.md && !x.mdh ? [x.md] : []));
  // Before useUpdates, so its checks see the lists loading ahead and wait for them.
  useEffect(() => prefetchChapters(mds), [lib]);
  useEffect(() => keepCovers(lib), [lib]);
  const updates = useUpdates(lib);
  // The ids picked for removal while selecting, or null when not selecting.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [webtoonOpen, setWebtoonOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // The card held open with its menu, and where it sat on screen.
  const [menu, setMenu] = useState<{ x: SeriesT; at: DOMRect } | null>(null);
  const view = useLibraryView();
  const downloads = useDownloads();
  const tab = useLibraryShelf();
  // Downloaded shows only where chapters can be saved; a browser that cannot opens Reading instead.
  const shelf = tab === 'downloads' && !downloads.can ? 'reading' : tab;
  const tabs = downloads.can ? [...SHELVES, { k: 'downloads' as const, n: 'Downloaded' }] : SHELVES;
  const openShelf = (k: LibraryTab) => {
    setLibraryShelf(k);
    // Picks stay on the shelf they were made on, so Move and Remove only act on series in view. Downloaded has no series to pick.
    setPicked((p) => (k === 'downloads' ? null : p && []));
  };
  // A swipe to the left opens the shelf on the right of this one, and a swipe to the right the one on its left.
  const at = tabs.findIndex((q) => q.k === shelf);
  // The shelf a swipe is settling on: its tab lights up as the finger lets go, not once the shelf has slid into place.
  const [aim, setAim] = useState<LibraryTab | null>(null);
  const lit = aim ?? shelf;
  const swipe = useSwipe(
    (dir) => !!tabs[at - dir],
    (dir) => {
      setAim(null);
      openShelf(tabs[at - dir]!.k);
    },
    false,
    (dir) => setAim(tabs[at - dir]!.k),
  );
  // A swipe can open a shelf whose tab is scrolled out of the row.
  const tabsRef = useRef<HTMLDivElement>(null);
  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would call it as the cleanup.
  useEffect(() => {
    tabsRef.current?.querySelector('[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [lit]);
  // Holding a card opens its menu, and holding a row starts selecting with it picked; the click that ends the hold is not a tap.
  const holdTimer = useRef(0);
  const holdAt = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const f = updates.failed;

  const hold = (x: SeriesT, el: HTMLElement) => {
    if (view === 'cards') setMenu({ x, at: el.getBoundingClientRect() });
    else setPicked([x.id]);
    navigator.vibrate?.(10);
  };
  const startHold = (x: SeriesT, e: PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    held.current = false;
    holdAt.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      hold(x, el);
    }, 500);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  const freshOf = (x: SeriesT) => (x.md && !x.mdh && x.last ? newCount(latestFor(x.md), x.last) : null);
  // A card's cover, badges and title, on the shelf and lifted over it by its menu.
  const face = (x: SeriesT) => {
    const last = x.last || 0;
    const fresh = freshOf(x);
    return (
      <>
        {x.cover ? <img src={imageSrc(x.cover)} referrerPolicy="same-origin" loading="lazy" alt="" /> : <span className="cover" />}
        <span className="badges">
          {last > 0 && <span className="badge">Ch. {fmt(last)}</span>}
          {fresh?.n ? (
            <span className="badge new">
              {fresh.n}
              {fresh.more ? '+' : ''} new
            </span>
          ) : null}
        </span>
        <span className="ct">{x.title}</span>
      </>
    );
  };
  // What pressing a series does, in either view: a tap opens it, or picks it while selecting; holding opens its menu or starts selecting.
  const press = (x: SeriesT) => ({
    // The press comes a moment before the click, so a list still loading starts that much sooner.
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (picked) return;
      if (x.md && !x.mdh) loadChapters(x.md);
      startHold(x, e);
    },
    // A swipe between shelves keeps the pointer, and the card moves along under it, so moving the finger at all ends the hold.
    onPointerMove: (e: PointerEvent) => {
      if (pastSlop(e.clientX - holdAt.current.x, e.clientY - holdAt.current.y)) endHold();
    },
    onPointerUp: endHold,
    onPointerLeave: endHold,
    onPointerCancel: endHold,
    // A right-click, or the menu key, opens a card's menu at once.
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      if (view !== 'cards' || picked) return;
      endHold();
      hold(x, e.currentTarget);
    },
    onClick: () => {
      if (held.current) held.current = false;
      else if (picked) toggle(x.id);
      else navigate({ name: 'series', id: x.id });
    },
  });

  const toggle = (id: string) => setPicked((p) => p && (p.includes(id) ? p.filter((k) => k !== id) : [...p, id]));
  const remove = (ids: string[]) => {
    if (!confirm(`Remove ${ids.length} series from My Series?`)) return;
    removeSeries(...ids);
    setPicked(null);
    toast(`Removed ${ids.length} series`);
  };
  const move = (ids: string[], k: Shelf) => {
    setShelf(ids, k);
    setPicked(null);
    toast(`Moved ${ids.length} series to ${SHELVES.find((q) => q.k === k)!.n}`);
  };

  // With no series at all, every series shelf shows how to start one instead of its own empty line.
  const welcome = (
    <div className="empty">
      <p>No series yet.</p>
      <button className="btn" onClick={() => navigate({ name: 'search' })}>
        Browse series
      </button>
      <p className="restore">
        Used InkNexus before, in another browser or on another device? Each one keeps its own list. Import the backup file you exported there.
      </p>
      <button className="btn ghost" onClick={importBackup}>
        Import backup
      </button>
      <p className="restore">Reading on Webtoon? Bring in every series from your Recent list.</p>
      <button className="btn ghost" onClick={() => setWebtoonOpen(true)}>
        Import from Webtoon
      </button>
    </div>
  );

  // Each shelf's series, or its saved chapters for Downloaded.
  const shelfBody = (k: LibraryTab) => {
    const shown = list.filter((x) => shelfOf(x) === k);
    const all = !!picked && shown.every((x) => picked.includes(x.id));
    return (
      <>
        {k !== 'downloads' && (
          <div className="lbar">
            <span className="sub">
              {shown.length} series{updates.checking ? ' · checking for new chapters…' : ''}
            </span>
            {picked && shown.length > 0 && (
              <button className="btn ghost sm all" onClick={() => setPicked(all ? [] : shown.map((x) => x.id))}>
                {all ? 'Deselect all' : 'Select all'}
              </button>
            )}
            <div className="seg" role="group" aria-label="Show series as">
              <button aria-label="Cards" aria-pressed={view === 'cards'} onClick={() => setLibraryView('cards')}>
                {/* four cards */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
                  <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
                  <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
                  <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
                </svg>
              </button>
              <button aria-label="List" aria-pressed={view === 'list'} onClick={() => setLibraryView('list')}>
                {/* three rows, each a thumbnail and a line */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 5.5h2M4 12h2M4 18.5h2M9.5 5.5H20M9.5 12H20M9.5 18.5H20" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {k === 'downloads' ? (
          <OfflineChapters />
        ) : !list.length ? (
          welcome
        ) : !shown.length ? (
          <p className="hint">Nothing in {SHELVES.find((q) => q.k === k)!.n} yet. To move series here, hold one on another shelf and tap Move.</p>
        ) : (
          // Both views stay mounted, the other one laid out but hidden under this one, so a switch shows covers already
          // loaded instead of new images that each flash a gray box first.
          <div className="views">
            <div className={view === 'list' ? 'lrows' : 'lrows off'} inert={view !== 'list'}>
              {shown.map((x) => {
                const last = x.last || 0;
                const fresh = freshOf(x);
                const on = picked?.includes(x.id);
                return (
                  <div key={x.id} className={`lrow${on ? ' on' : ''}`}>
                    <button className="lmain" aria-pressed={picked ? on : undefined} {...press(x)}>
                      {x.cover ? <img src={imageSrc(x.cover)} referrerPolicy="same-origin" loading="lazy" alt="" /> : <span className="thumb" />}
                      <span className="linfo">
                        <b>{x.title}</b>
                        <span>
                          {last > 0 ? `Ch. ${fmt(last)}` : 'Not started'}
                          {fresh?.n ? (
                            <em>
                              {' · '}
                              {fresh.n}
                              {fresh.more ? '+' : ''} new
                            </em>
                          ) : null}
                        </span>
                        {last > 0 && <span>Last read {daysAgo(x.t)}</span>}
                      </span>
                      {picked && (
                        <span className="tick" aria-hidden="true">
                          {on && '✓'}
                        </span>
                      )}
                    </button>
                    {!picked && <RowContinue x={x} />}
                  </div>
                );
              })}
            </div>
            <div className={view === 'cards' ? 'grid' : 'grid off'} inert={view !== 'cards'}>
              {shown.map((x) => {
                const on = picked?.includes(x.id);
                return (
                  <button key={x.id} className={`card${on ? ' on' : ''}`} aria-pressed={picked ? on : undefined} {...press(x)}>
                    {face(x)}
                    {picked && (
                      <span className="tick" aria-hidden="true">
                        {on && '✓'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  };

  const settings = (
    <button className="ibtn plain" aria-label="Settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.6 4.9 10.1 2.4 13.9 2.4 14.4 4.9 16.9 6.3 19.4 5.6 21.3 8.8 19.4 10.6 19.4 13.4 21.3 15.2 19.4 18.4 16.9 17.7 14.4 19.1 13.9 21.6 10.1 21.6 9.6 19.1 7.1 17.7 4.6 18.4 2.7 15.2 4.6 13.4 4.6 10.6 2.7 8.8 4.6 5.6 7.1 6.3z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
  const addLink = (
    <button className="ibtn plain" aria-label="Add by link" aria-expanded={linkOpen} onClick={() => setLinkOpen(true)}>
      +
    </button>
  );
  const sheets = (
    <>
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onWebtoon={() => setWebtoonOpen(true)} />}
      {linkOpen && <AddByLinkSheet onClose={() => setLinkOpen(false)} />}
      {webtoonOpen && <WebtoonSheet onClose={() => setWebtoonOpen(false)} />}
      {menu && (
        <HoldMenu at={menu.at} card={face(menu.x)} label={menu.x.title} onClose={() => setMenu(null)}>
          <button onClick={() => navigate({ name: 'series', id: menu.x.id, info: true })}>
            More info
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v6M12 7.5v.01" />
            </svg>
          </button>
          <button onClick={() => void shareSeries(menu.x, toast)}>
            Share
            {/* an arrow up out of a tray */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12M7 8l5-5 5 5" />
              <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
            </svg>
          </button>
          <button onClick={() => setPicked([menu.x.id])}>
            Select
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.5 2.5L16 9.5" />
            </svg>
          </button>
        </HoldMenu>
      )}
      {moveOpen && shelf !== 'downloads' && <MoveSheet from={shelf} onMove={(k) => move(picked ?? [], k)} onClose={() => setMoveOpen(false)} />}
    </>
  );

  return (
    <>
      {/* Kept in view while the shelf under it scrolls */}
      <div className="lhead">
        {picked ? (
          <div className="rbar">
            <button className="btn ghost sm" onClick={() => setPicked(null)}>
              Cancel
            </button>
            <b>{picked.length ? `${picked.length} selected` : 'Tap series to select'}</b>
            <button className="btn ghost sm" disabled={!picked.length} aria-expanded={moveOpen} onClick={() => setMoveOpen(true)}>
              Move
            </button>
            <button className="btn danger sm" disabled={!picked.length} onClick={() => remove(picked)}>
              Remove
            </button>
          </div>
        ) : (
          <header>
            <h1>My Series</h1>
            {shelf !== 'downloads' && (
              <button className="ibtn plain" aria-label="Remove series" onClick={() => setPicked([])}>
                {/* a trash can: lid with handle, then the can */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M9.5 7V4.5h5V7" />
                  <path d="M6 7l1 13h10l1-13M10 11v5M14 11v5" />
                </svg>
              </button>
            )}
            {addLink}
            {settings}
          </header>
        )}
        <div ref={tabsRef} className="tabs" role="group" aria-label="Shelves">
          {tabs.map((q) => {
            const on = q.k === lit;
            return (
              <button key={q.k} aria-pressed={on} onClick={() => openShelf(q.k)}>
                {q.n}
              </button>
            );
          })}
        </div>
      </div>
      {/* Every shelf side by side, so a swipe pulls the next one in beside this one */}
      <div ref={swipe} className="track" style={{ translate: `${-at * 100}%` }}>
        {tabs.map((q) => (
          <div key={q.k} className={q.k === shelf ? 'on' : undefined} inert={q.k !== shelf}>
            {shelfBody(q.k)}
          </div>
        ))}
      </div>
      {f.length > 0 && (
        <div className="pad">
          <p className="hint">
            Could not check {f.length === 1 ? f[0]!.title : `${f.length} series`} for new chapters ({f[0]!.error}).
          </p>
          <button className="btn ghost sm" onClick={() => checkUpdates(lib, true)}>
            Check again
          </button>
        </div>
      )}
      {sheets}
    </>
  );
}

/**
 * A list row's Continue: the chapter the series screen would continue with, in the reader or on the site. Until that is
 * known (the chapter list is still loading, the source has no chapter links, or every chapter is read) it opens the series.
 */
function RowContinue({ x }: { x: SeriesT }) {
  const { navigate } = useApp();
  const cur = shownSource(x);
  const chs = useChapterState(cur === 'md' ? x.md : null);
  const last = x.last || 0;
  const left = leftChapter(x.id) ?? -1;
  const c = chs?.status === 'ready' ? continueChapter(chs.list.chapters, last, left) : undefined;
  const i = cur.startsWith('l') ? +cur.slice(1) : -1;
  const l = x.links[i];
  if (c)
    return (
      <ReadButton x={x} c={c} className="btn ghost sm go">
        {last || c.num === left ? 'Continue' : 'Start'}
        <small>Ch. {fmt(c.num)}</small>
      </ReadButton>
    );
  if (l?.tpl) return <LinkRowContinue x={x} l={l} i={i} />;
  return (
    <button className="btn ghost sm go" onClick={() => navigate({ name: 'series', id: x.id })}>
      {last ? 'Continue' : 'Start'}
    </button>
  );
}

function LinkRowContinue({ x, l, i }: { x: SeriesT; l: Link; i: number }) {
  const open = useOpenLink(x, l, i, x.last || 0);
  return (
    <button className="btn ghost sm go" onClick={() => open('cont')}>
      Continue
      <small>Ch. {nextWhole(x.last || 0)}</small>
    </button>
  );
}

/**
 * A held card's menu: the card lifts in place over the blurred shelf with its actions under it, all moved up when they
 * would run off the screen. Any action closes it, and so do a tap outside and Escape.
 */
function HoldMenu({ at, card, label, onClose, children }: { at: DOMRect; card: ReactNode; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(at.top);
  // The click that ends the hold can land here; only a tap that starts here closes the menu.
  const tapped = useRef(false);
  useDialogFocus(ref, onClose);
  useLayoutEffect(() => setTop(Math.max(16, Math.min(at.top, innerHeight - 16 - ref.current!.offsetHeight))), []);
  return (
    <div id="hold" onPointerDown={() => (tapped.current = true)} onClick={() => tapped.current && onClose()}>
      <div ref={ref} className="held" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} style={{ top, left: at.left, width: at.width }}>
        <div className="card" aria-hidden="true">
          {card}
        </div>
        {/* A card on the right half keeps its menu on its right edge, so the menu stays on screen */}
        <div className={`hmenu${at.left + at.width / 2 > innerWidth / 2 ? ' end' : ''}`} onClick={onClose}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Pick the shelf to move the selected series to. */
function MoveSheet({ from, onMove, onClose }: { from: Shelf; onMove: (k: Shelf) => void; onClose: () => void }) {
  const sheet = useSheet(onClose);
  return (
    <Sheet label="Move to" sheet={sheet}>
      <h2>Move to</h2>
      <div className="stack">
        {SHELVES.filter((q) => q.k !== from).map((q) => (
          <button
            key={q.k}
            className="btn ghost"
            onClick={() => {
              onMove(q.k);
              sheet.close();
            }}
          >
            {q.n}
          </button>
        ))}
        <button className="btn ghost" onClick={sheet.close}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

/** Settings in a drawer from the right edge, opened from the gear. `onWebtoon` opens the Webtoon import. */
function SettingsSheet({ onClose, onWebtoon }: { onClose: () => void; onWebtoon: () => void }) {
  const sheet = useSheet(onClose);
  const updates = useShowsReadingUpdates();
  return (
    <Sheet label="Settings" sheet={sheet} drawer>
      <h2>Settings</h2>
      <ThemePicker />
      <div className="pad">
        <label className="opt">
          <input type="checkbox" checked={updates} onChange={(e) => setShowsReadingUpdates(e.target.checked)} />
          Show reading updates, like "Chapter 5 marked read" and "Zoom 150%"
        </label>
      </div>
      <BackupSettings close={sheet.close} onWebtoon={onWebtoon} />
    </Sheet>
  );
}

/** Export and import of the library, with when it was last backed up, and the Webtoon import. Each browser keeps its own library, so a file is how it moves. */
function BackupSettings({ close, onWebtoon }: { close: () => void; onWebtoon: () => void }) {
  const { importBackup } = useApp();
  const state = useStore();
  const at = useLastBackup();
  return (
    <>
      <p className="hint">Backup</p>
      <p className="credit">Each browser keeps its own library. Export a backup file to keep your reading safe or move it to another phone.</p>
      <p className="credit" aria-live="polite">
        {backupStatus(state, at)}
      </p>
      <button className="btn" onClick={() => saveBackup(state)}>
        Export backup
      </button>
      <button
        className="btn ghost"
        onClick={() => {
          importBackup();
          // The import's choices open in a sheet of their own.
          close();
        }}
      >
        Import backup
      </button>
      <button
        className="btn ghost"
        onClick={() => {
          onWebtoon();
          close();
        }}
      >
        Import from Webtoon
      </button>
    </>
  );
}

/** My Series' Downloaded tab: the chapters saved for reading offline, by series, with their sizes and a way to remove each or all. */
function OfflineChapters() {
  const { saved, saving } = useDownloads();
  const total = saved.reduce((t, d) => t + d.bytes, 0);
  const sorted = [...saved].sort((a, b) => a.t.localeCompare(b.t) || a.c.num - b.c.num);
  return (
    <>
      <div>
        {sorted.map((d) => (
          <div key={d.c.id} className="dl">
            <span>
              <b>{d.t}</b>
              Ch. {fmt(d.c.num)} · {fileSize(d.bytes)}
            </span>
            <button className="ibtn plain" aria-label={`Remove ch. ${fmt(d.c.num)} of ${d.t}`} onClick={() => removeDownload(d.c.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="pad">
        <p className="hint">
          {saved.length
            ? `${plural(saved.length, 'chapter')}, ${fileSize(total)}. A chapter is removed once you finish reading it.`
            : "None yet. Save a chapter with the arrow next to it in a series' MangaDex chapters."}{' '}
          They are kept on this device only. On iPhone, add InkNexus to the Home Screen: Safari can clear a site's data after a week without a visit.
        </p>
        {saved.length > 0 && (
          <button className="btn danger sm" disabled={!!saving} onClick={() => confirm('Remove all offline chapters?') && removeAllDownloads()}>
            Remove all
          </button>
        )}
      </div>
    </>
  );
}
