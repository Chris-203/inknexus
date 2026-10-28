import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useApp } from '../context';
import { AddByLinkSheet } from '../components/AddByLinkSheet';
import { ReadButton } from '../components/ReadButton';
import { Sheet, useSheet } from '../components/Sheet';
import { ThemePicker } from '../components/ThemePicker';
import { imageSrc } from '../lib/api';
import { loadChapters, prefetchChapters, useChapterState } from '../lib/chapters';
import { removeAllDownloads, removeDownload, useDownloads } from '../lib/downloads';
import { daysAgo, fileSize, fmt, plural } from '../lib/format';
import { SHELVES, setLibraryShelf, setLibraryView, shelfOf, useLibraryShelf, useLibraryView } from '../lib/libraryView';
import { nextWhole } from '../lib/links';
import { useOpenLink } from '../lib/openLink';
import { continueChapter } from '../lib/preload';
import { setShowsReadingUpdates, useShowsReadingUpdates } from '../lib/readingUpdates';
import { leftChapter } from '../lib/spots';
import { getState, removeSeries, setShelf, shownSource, useStore } from '../lib/store';
import type { Link, Series as SeriesT, Shelf } from '../lib/types';
import { checkUpdates, latestFor, newCount, useUpdates } from '../lib/updates';

function exportBackup() {
  const u = URL.createObjectURL(new Blob([JSON.stringify(getState())], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = u;
  a.download = 'inknexus-backup.json';
  document.body.append(a);
  a.click();
  a.remove();
  // Revoking right away can cancel the download on iOS Safari.
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export function Library() {
  const { navigate, importBackup, toast } = useApp();
  const { lib } = useStore();
  const list = [...lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const mds = list.flatMap((x) => (x.md && !x.mdh ? [x.md] : []));
  // Before useUpdates, so its checks see the lists loading ahead and wait for them.
  useEffect(() => prefetchChapters(mds), [lib]);
  const updates = useUpdates(lib);
  // The ids picked for removal while selecting, or null when not selecting.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const view = useLibraryView();
  const shelf = useLibraryShelf();
  const shown = list.filter((x) => shelfOf(x) === shelf);
  // Holding a card starts selecting with it picked; the click that ends the hold is not a tap.
  const holdTimer = useRef(0);
  const held = useRef(false);
  const f = updates.failed;

  const startHold = (id: string) => {
    held.current = false;
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setPicked([id]);
      navigator.vibrate?.(10);
    }, 500);
  };
  const endHold = () => clearTimeout(holdTimer.current);

  const freshOf = (x: SeriesT) => (x.md && !x.mdh && x.last ? newCount(latestFor(x.md), x.last) : null);
  // What pressing a series does, in either view: a tap opens it, or picks it while selecting; holding starts selecting.
  const press = (x: SeriesT) => ({
    // The press comes a moment before the click, so a list still loading starts that much sooner.
    onPointerDown: () => {
      if (picked) return;
      if (x.md && !x.mdh) loadChapters(x.md);
      startHold(x.id);
    },
    // Scrolling cancels the pointer, so a swipe through the series never starts selecting.
    onPointerUp: endHold,
    onPointerLeave: endHold,
    onPointerCancel: endHold,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
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
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {linkOpen && <AddByLinkSheet onClose={() => setLinkOpen(false)} />}
      {moveOpen && <MoveSheet from={shelf} onMove={(k) => move(picked ?? [], k)} onClose={() => setMoveOpen(false)} />}
    </>
  );

  if (!list.length)
    return (
      <>
        <header>
          <h1>My Series</h1>
          <span className="sub">0 series</span>
          {addLink}
          {settings}
        </header>
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
        </div>
        {sheets}
      </>
    );

  return (
    <>
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
          <button className="ibtn plain" aria-label="Remove series" onClick={() => setPicked([])}>
            {/* a trash can: lid with handle, then the can */}
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M9.5 7V4.5h5V7" />
              <path d="M6 7l1 13h10l1-13M10 11v5M14 11v5" />
            </svg>
          </button>
          {addLink}
          {settings}
        </header>
      )}
      <div className="tabs" role="group" aria-label="Shelves">
        {SHELVES.map((q) => {
          const on = q.k === shelf;
          return (
            <button
              key={q.k}
              aria-pressed={on}
              onClick={() => {
                setLibraryShelf(q.k);
                // Picks stay on the shelf they were made on, so Move and Remove only act on series in view.
                setPicked((p) => p && []);
              }}
            >
              {q.n}
            </button>
          );
        })}
      </div>
      <div className="lbar">
        <span className="sub">
          {shown.length} series{updates.checking ? ' · checking for new chapters…' : ''}
        </span>
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
      {!shown.length ? (
        <p className="hint">Nothing in {SHELVES.find((q) => q.k === shelf)!.n} yet. To move series here, hold one on another shelf and tap Move.</p>
      ) : view === 'list' ? (
        <div className="lrows">
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
      ) : (
        <div className="grid">
          {shown.map((x) => {
            const last = x.last || 0;
            const fresh = freshOf(x);
            const on = picked?.includes(x.id);
            return (
              <button key={x.id} className={`card${on ? ' on' : ''}`} aria-pressed={picked ? on : undefined} {...press(x)}>
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
                {picked && (
                  <span className="tick" aria-hidden="true">
                    {on && '✓'}
                  </span>
                )}
                <span className="ct">{x.title}</span>
              </button>
            );
          })}
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
      <div className="row foot">
        <button className="btn ghost sm" onClick={exportBackup}>
          Export backup
        </button>
        <button className="btn ghost sm" onClick={importBackup}>
          Import backup
        </button>
      </div>
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

/** Settings in a drawer from the right edge, opened from the gear. */
function SettingsSheet({ onClose }: { onClose: () => void }) {
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
      <OfflineChapters />
    </Sheet>
  );
}

/** The chapters saved for reading offline, by series, with their sizes and a way to remove each or all. */
function OfflineChapters() {
  const { saved, saving, can } = useDownloads();
  if (!can) return null;
  const total = saved.reduce((t, d) => t + d.bytes, 0);
  const sorted = [...saved].sort((a, b) => a.t.localeCompare(b.t) || a.c.num - b.c.num);
  return (
    <>
      <p className="hint">Offline chapters</p>
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
