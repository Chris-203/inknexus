import { useApp } from '../context';
import { fmt } from '../lib/format';
import { getState, useStore } from '../lib/store';
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
  const { navigate, importBackup } = useApp();
  const { lib } = useStore();
  const updates = useUpdates(lib);
  const list = [...lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const f = updates.failed;

  if (!list.length)
    return (
      <>
        <header>
          <h1>Library</h1>
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
      </>
    );

  return (
    <>
      <header>
        <h1>Library</h1>
        <span className="sub">
          {list.length} series{updates.checking ? ' · checking for new chapters…' : ''}
        </span>
      </header>
      <div className="grid">
        {list.map((x) => {
          const last = x.last || 0;
          const fresh = x.md && !x.mdh && last ? newCount(latestFor(x.md), last) : null;
          return (
            <button key={x.id} className="card" onClick={() => navigate({ name: 'series', id: x.id })}>
              {x.cover ? <img src={x.cover} loading="lazy" alt="" /> : <span className="cover" />}
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
    </>
  );
}
