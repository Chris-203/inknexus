import { removeAllDownloads, removeDownload, useDownloads } from '../lib/downloads';
import { fileSize, fmt, plural } from '../lib/format';

/** My Series' Downloaded tab: the chapters saved for reading offline, by series, with their sizes and a way to remove each or all. */
export function OfflineChapters() {
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
