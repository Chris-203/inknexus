import { useApp } from '../context';
import { fmt } from '../lib/links';
import { getState, useStore } from '../lib/store';
import { newCount, useUpdates } from '../lib/updates';

function exportBackup() {
  const u = URL.createObjectURL(new Blob([JSON.stringify(getState())], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = u;
  a.download = 'inknexus-backup.json';
  a.click();
  URL.revokeObjectURL(u);
}

export function Library() {
  const { navigate, importBackup } = useApp();
  const { lib } = useStore();
  const list = [...lib].sort((a, b) => (b.t || 0) - (a.t || 0));
  const updates = useUpdates(lib);
  return (
    <>
      <header>
        <h1>Library</h1>
        <span className="sub">
          {list.length} series{updates.checking ? ' · checking for new chapters…' : ''}
        </span>
      </header>
      {list.length ? (
        <>
          <div className="grid">
            {list.map((x) => {
              const fresh = x.md && !x.mdh ? newCount(updates.latest[x.md], x.last || 0) : { n: 0, more: false };
              return (
                <button key={x.id} className="card" onClick={() => navigate({ name: 'series', id: x.id })}>
                  {x.cover ? <img src={x.cover} loading="lazy" alt="" /> : <div className="cover" />}
                  <span className="badge">Ch. {fmt(x.last || 0)}</span>
                  {fresh.n > 0 && (
                    <span className="badge new">
                      {fresh.n}
                      {fresh.more ? '+' : ''} new
                    </span>
                  )}
                  <span className="ct">{x.title}</span>
                </button>
              );
            })}
          </div>
          {updates.failed.length > 0 && (
            <div className="pad">
              <p className="hint" style={{ padding: 0 }}>
                Could not check {updates.failed.length === 1 ? updates.failed[0]!.title : `${updates.failed.length} series`} for new chapters (
                {updates.failed[0]!.error}).
              </p>
              <button className="btn ghost sm" onClick={updates.recheck}>
                Check again
              </button>
            </div>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost sm" onClick={exportBackup}>
              Export backup
            </button>
            <button className="btn ghost sm" onClick={importBackup}>
              Import backup
            </button>
          </div>
        </>
      ) : (
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
      )}
    </>
  );
}
