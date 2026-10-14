import { useState } from 'react';
import { useApp } from '../context';
import { Sheet, useSheet } from '../components/Sheet';
import { ThemePicker } from '../components/ThemePicker';
import { imageSrc } from '../lib/api';
import { fmt } from '../lib/format';
import { getState, removeSeries, useStore } from '../lib/store';
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
  const updates = useUpdates(lib);
  // The ids picked for removal while selecting, or null when not selecting.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const list = [...lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const f = updates.failed;

  const toggle = (id: string) => setPicked((p) => p && (p.includes(id) ? p.filter((k) => k !== id) : [...p, id]));
  const remove = (ids: string[]) => {
    if (!confirm(`Remove ${ids.length} series from My Series?`)) return;
    removeSeries(...ids);
    setPicked(null);
    toast(`Removed ${ids.length} series`);
  };

  const settings = (
    <button className="ibtn" aria-label="Settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(true)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.6 4.9 10.1 2.4 13.9 2.4 14.4 4.9 16.9 6.3 19.4 5.6 21.3 8.8 19.4 10.6 19.4 13.4 21.3 15.2 19.4 18.4 16.9 17.7 14.4 19.1 13.9 21.6 10.1 21.6 9.6 19.1 7.1 17.7 4.6 18.4 2.7 15.2 4.6 13.4 4.6 10.6 2.7 8.8 4.6 5.6 7.1 6.3z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
  const settingsSheet = settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />;

  if (!list.length)
    return (
      <>
        <header>
          <h1>My Series</h1>
          <span className="sub">0 series</span>
          {settings}
        </header>
        <div className="empty">
          <p>No series yet.</p>
          <button className="btn" onClick={() => navigate({ name: 'search' })}>
            Search for a series
          </button>
          <p className="restore">
            Used InkNexus before, in another browser or on another device? Each one keeps its own list. Import the backup file you exported there.
          </p>
          <button className="btn ghost" onClick={importBackup}>
            Import backup
          </button>
        </div>
        {settingsSheet}
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
          <span className="sub">
            {list.length} series{updates.checking ? ' · checking for new chapters…' : ''}
          </span>
          <button className="btn ghost sm" onClick={() => setPicked([])}>
            Select
          </button>
          {settings}
        </header>
      )}
      <div className="grid">
        {list.map((x) => {
          const last = x.last || 0;
          const fresh = x.md && !x.mdh && last ? newCount(latestFor(x.md), last) : null;
          const on = picked?.includes(x.id);
          return (
            <button
              key={x.id}
              className={`card${on ? ' on' : ''}`}
              aria-pressed={picked ? on : undefined}
              onClick={() => (picked ? toggle(x.id) : navigate({ name: 'series', id: x.id }))}
            >
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
      {settingsSheet}
    </>
  );
}

/** Settings in a drawer from the right edge, opened from the gear. */
function SettingsSheet({ onClose }: { onClose: () => void }) {
  const sheet = useSheet(onClose);
  return (
    <Sheet label="Settings" sheet={sheet} drawer>
      <h2>Settings</h2>
      <ThemePicker />
      <button className="btn ghost" onClick={sheet.close}>
        Close
      </button>
    </Sheet>
  );
}
