// Append-only JSONL log (one JSON object per line), rotated to `<path>.1` once it reaches
// maxBytes. Replaces a read-parse-rewrite of the whole JSON array on every receipt scan,
// which was synchronous, O(file size), and lost the entire log if the file ever got corrupted.
import fs from 'fs';

export function createScanLogger({ path, maxBytes }) {
  // Serialized so a rotation can never interleave with an append.
  let queue = Promise.resolve();
  return function appendScanLog(entry) {
    queue = queue.then(async () => {
      try {
        const st = await fs.promises.stat(path).catch(() => null);
        if (st && st.size >= maxBytes) await fs.promises.rename(path, `${path}.1`);
        await fs.promises.appendFile(path, `${JSON.stringify(entry)}\n`);
      } catch (err) {
        console.error('[ScanLog] append failed:', err.message);
      }
    });
    return queue;
  };
}
