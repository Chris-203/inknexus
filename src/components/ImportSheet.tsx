import { useState } from 'react';
import { fmt } from '../lib/format';
import type { Duplicate } from '../lib/importBackup';
import { ResultRow } from './ResultRow';
import { Sheet } from './Sheet';

/** For each backup series already in the library with a different last chapter, pick which version to keep. Sources and new series are handled either way. */
export function ImportSheet({
  dupes,
  added,
  onImport,
  onClose,
}: {
  dupes: Duplicate[];
  added: number;
  onImport: (fromBackup: Duplicate[]) => void;
  onClose: () => void;
}) {
  // Each starts on the version read further; a tie keeps the library's.
  const [useBackup, setUseBackup] = useState(() => dupes.map((d) => d.theirs.last > d.mine.last));
  const pick = (i: number, backup: boolean) => setUseBackup((u) => u.map((v, k) => (k === i ? backup : v)));

  return (
    <Sheet label="Import backup" onClose={onClose}>
      <h2>Import backup</h2>
      <p className="hint">
        {dupes.length === 1 ? 'This series has' : `These ${dupes.length} series have`} a different last chapter in the backup. Tap the version to keep. Each
        series keeps the sources of whichever version has more.
        {added ? ` ${added} new series will be added too.` : ''}
      </p>
      {dupes.length > 1 && (
        <div className="row">
          <button className="btn ghost sm" onClick={() => setUseBackup(dupes.map(() => false))}>
            Keep all from library
          </button>
          <button className="btn ghost sm" onClick={() => setUseBackup(dupes.map(() => true))}>
            Use all from backup
          </button>
        </div>
      )}
      {dupes.map((d, i) => (
        <div key={`${d.mine.id}:${i}`}>
          <ResultRow o={d.mine} />
          <div className="dup">
            {[d.mine, d.theirs].map((x, k) => {
              const on = useBackup[i] === (k === 1);
              return (
                <button key={k} className={`dup-opt${on ? ' on' : ''}`} aria-pressed={on} onClick={() => pick(i, k === 1)}>
                  <span>{k ? 'In the backup' : 'In your library'}</span>
                  <b>{x.last ? `Last read: Ch. ${fmt(x.last)}` : 'Not started'}</b>
                  <span>{x.title}</span>
                  {x.t > 0 && <span>Updated {new Date(x.t).toLocaleDateString()}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button className="btn" onClick={() => onImport(dupes.filter((_, i) => useBackup[i]))}>
        Import
      </button>
      <button className="btn ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
