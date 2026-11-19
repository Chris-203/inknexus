import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { useApp } from '../context';
import { AddByLinkSheet } from '../components/AddByLinkSheet';
import { CardFace } from '../components/CardFace';
import { LibraryBar } from '../components/LibraryBar';
import { LibraryWelcome } from '../components/LibraryWelcome';
import { OfflineChapters } from '../components/OfflineChapters';
import { SeriesViews } from '../components/SeriesViews';
import { Sheet, useDialogFocus, useSheet } from '../components/Sheet';
import { SyncSettings } from '../components/SyncSettings';
import { ThemePicker } from '../components/ThemePicker';
import { WebtoonSheet } from '../components/WebtoonSheet';
import { backupStatus, saveBackup, useLastBackup } from '../lib/backup';
import { loadChapters, prefetchChapters } from '../lib/chapters';
import { keepCovers } from '../lib/covers';
import { useDownloads } from '../lib/downloads';
import { titleHas } from '../lib/format';
import { useHold } from '../lib/hold';
import { SHELVES, setLibraryShelf, type LibraryTab, shelfName, shelfOf, useLibraryShelf, useLibraryView } from '../lib/libraryView';
import { setShowsReadingUpdates, useShowsReadingUpdates } from '../lib/readingUpdates';
import { useShelfSwipe } from '../lib/shelfSwipe';
import { shareSeries } from '../lib/share';
import { removeSeries, setShelf, useStore } from '../lib/store';
import type { Series as SeriesT, Shelf } from '../lib/types';
import { checkUpdates, useUpdates } from '../lib/updates';

export function Library() {
  const { navigate, toast } = useApp();
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
  // What the search field holds, or null while it is closed. A search looks through every shelf, not just the open one.
  const [q, setQ] = useState<string | null>(null);
  const found = q?.trim() ? list.filter((x) => titleHas(x.title, q)) : null;
  const view = useLibraryView();
  const downloads = useDownloads();
  const tab = useLibraryShelf();
  // Downloaded shows only where chapters can be saved; a browser that cannot opens Reading instead.
  const shelf = tab === 'downloads' && !downloads.can ? 'reading' : tab;
  const tabs = downloads.can ? [...SHELVES, { k: 'downloads' as const, n: 'Downloaded' }] : SHELVES;
  const openShelf = (k: LibraryTab) => {
    setLibraryShelf(k);
    // A shelf always opens at its top.
    scrollTo(0, 0);
    // Picks stay on the shelf they were made on, so Move and Remove only act on series in view. Downloaded has no series to pick.
    setPicked((p) => (k === 'downloads' ? null : p && []));
  };
  const { at, lit, setTrack, tabsRef } = useShelfSwipe(tabs, shelf, openShelf);
  const hold = useHold();
  const f = updates.failed;

  // Holding a card opens its menu, and holding a row starts selecting with it picked.
  const onHold = (x: SeriesT, el: HTMLElement) => {
    if (view === 'cards') setMenu({ x, at: el.getBoundingClientRect() });
    else setPicked([x.id]);
    navigator.vibrate?.(10);
  };
  // What pressing a series does, in either view: a tap opens it, or picks it while selecting; holding opens its menu or starts selecting.
  const press = (x: SeriesT) => ({
    // The press comes a moment before the click, so a list still loading starts that much sooner.
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (picked) return;
      if (x.md && !x.mdh) loadChapters(x.md);
      hold.start(e, (el) => onHold(x, el));
    },
    onPointerMove: hold.move,
    onPointerUp: hold.end,
    onPointerLeave: hold.end,
    onPointerCancel: hold.end,
    // A right-click, or the menu key, opens a card's menu at once.
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      e.preventDefault();
      if (view !== 'cards' || picked) return;
      hold.end();
      onHold(x, e.currentTarget);
    },
    onClick: () => {
      if (hold.took()) return;
      if (picked) toggle(x.id);
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
    // The series left on the shelf start again from its top.
    scrollTo(0, 0);
    toast(`Moved ${ids.length} series to ${shelfName(k)}`);
  };

  const bar = (shown: SeriesT[]) => <LibraryBar shown={shown} picked={picked} onPick={setPicked} checking={updates.checking} />;
  // Each shelf's series, or its saved chapters for Downloaded.
  const shelfBody = (k: LibraryTab) => {
    const shown = list.filter((x) => shelfOf(x) === k);
    return (
      <>
        {k !== 'downloads' && bar(shown)}
        {k === 'downloads' ? (
          <OfflineChapters />
        ) : !list.length ? (
          // With no series at all, every series shelf shows how to start one instead of its own empty line.
          <LibraryWelcome onWebtoon={() => setWebtoonOpen(true)} />
        ) : !shown.length ? (
          <p className="hint">Nothing in {shelfName(k)} yet. To move series here, hold one on another shelf and tap Move.</p>
        ) : (
          <SeriesViews shown={shown} picked={picked} press={press} />
        )}
      </>
    );
  };

  // A magnifier, on the search button and in the field it opens.
  const lens = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
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
        <HoldMenu at={menu.at} card={<CardFace x={menu.x} />} label={menu.x.title} onClose={() => setMenu(null)}>
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
      {moveOpen && (
        <MoveSheet from={found || shelf === 'downloads' ? undefined : shelf} onMove={(k) => move(picked ?? [], k)} onClose={() => setMoveOpen(false)} />
      )}
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
        ) : q !== null ? (
          <form
            className="row lsearch"
            role="search"
            onSubmit={(e) => {
              // Search runs as you type, so Search on the keyboard only puts the keyboard away.
              e.preventDefault();
              (document.activeElement as HTMLElement).blur();
            }}
          >
            <div className="field">
              {lens}
              <input
                type="search"
                enterKeyHint="search"
                aria-label="Search My Series"
                placeholder="Search My Series"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQ(null)}
                autoComplete="off"
                autoFocus
              />
            </div>
            <button type="button" className="btn ghost" onClick={() => setQ(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <header>
            <h1>My Series</h1>
            <button className="ibtn plain" aria-label="Search My Series" onClick={() => setQ('')}>
              {lens}
            </button>
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
        {/* Search results come from every shelf, so the tabs make way for them */}
        {!found && (
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
        )}
      </div>
      {found ? (
        <div className="found">
          {bar(found)}
          {found.length ? <SeriesViews shown={found} shelves picked={picked} press={press} /> : <p className="hint">No series in My Series match "{q}".</p>}
        </div>
      ) : (
        // Every shelf side by side, so a swipe pulls the next one in beside this one
        <div ref={setTrack} className="track" style={{ translate: `${-at * 100}%` }}>
          {tabs.map((q) => (
            <div key={q.k} className={q.k === shelf ? 'on' : undefined} inert={q.k !== shelf}>
              {shelfBody(q.k)}
            </div>
          ))}
        </div>
      )}
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

/** Pick the shelf to move the selected series to; every shelf but `from`, the one they are on, when they all share one. */
function MoveSheet({ from, onMove, onClose }: { from?: Shelf; onMove: (k: Shelf) => void; onClose: () => void }) {
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
      <SyncSettings />
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
