import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useApp } from '../context';
import { AddByLinkSheet } from '../components/AddByLinkSheet';
import { ReadButton } from '../components/ReadButton';
import { Sheet, useSheet } from '../components/Sheet';
import { ThemePicker } from '../components/ThemePicker';
import { imageSrc } from '../lib/api';
import { loadChapters, prefetchChapters, useChapterState } from '../lib/chapters';
import { daysAgo, fmt } from '../lib/format';
import { setLibraryView, useLibraryView } from '../lib/libraryView';
import { nextWhole } from '../lib/links';
import { useOpenLink } from '../lib/openLink';
import { continueChapter } from '../lib/preload';
import { setShowsReadingUpdates, useShowsReadingUpdates } from '../lib/readingUpdates';
import { leftChapter } from '../lib/spots';
import { getState, removeSeries, shownSource, useStore } from '../lib/store';
import type { Link, Series as SeriesT } from '../lib/types';
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
  const view = useLibraryView();
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
      <div className="lbar">
        <span className="sub">
          {list.length} series{updates.checking ? ' · checking for new chapters…' : ''}
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
      {view === 'list' ? (
        <div className="lrows">
          {list.map((x) => {
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
          {list.map((x) => {
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
    </Sheet>
  );
}
