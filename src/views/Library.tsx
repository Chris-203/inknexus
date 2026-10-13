import { useState } from 'react';
import { useApp } from '../context';
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
  const list = [...lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const f = updates.failed;

  const toggle = (id: string) => setPicked((p) => p && (p.includes(id) ? p.filter((k) => k !== id) : [...p, id]));
  const remove = (ids: string[]) => {
    if (!confirm(`Remove ${ids.length} series from your library?`)) return;
    removeSeries(...ids);
    setPicked(null);
    toast(`Removed ${ids.length} series`);
  };

  if (!list.length)
    return (
      <>
        <header>
          <h1>My Series</h1>
          <span className="sub">0 series</span>
        </header>
        <div className="empty">
          <p>Your library is empty.</p>
          <button className="btn" onClick={() => navigate({ name: 'search' })}>
            Find a series
          </button>
          <p className="restore">
            Used InkNexus before, in another browser or on another device? Each one keeps its own library. Import the backup file you exported there.
          </p>
          <button className="btn ghost" onClick={importBackup}>
            Import backup
          </button>
        </div>
        <ThemePicker />
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
      <ThemePicker />
    </>
  );
}
