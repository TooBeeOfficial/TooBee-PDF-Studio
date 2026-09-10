// Copies the offline background-removal model out of node_modules and into
// public/, so the packaged app carries it and never reaches for a network.
//
// Why a script rather than committing the files: the model is ~85 MB of binary
// that would bloat the repository and every clone of it for something npm
// already pins. This runs before each build, is idempotent, and skips silently
// when the optional data package is absent so a build without it still works.
//
// The library that consumes this (@imgly/background-removal) fetches
// `resources.json` from its configured publicPath, then fetches each chunk
// listed there by content hash and concatenates them. The manifest is rewritten
// rather than copied so it lists only what is actually shipped.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', '@imgly', 'background-removal-data', 'dist');
const dest = path.join(root, 'public', 'bg-removal');

/**
 * What gets shipped.
 *
 * `small` is the 44 MB model rather than the 88 MB `medium`, because this app
 * has to stay usable on old hardware and the difference on a signature — a
 * high-contrast mark on paper — does not justify doubling both the download and
 * the inference cost.
 *
 * All four ONNX runtimes are included even though exactly one is ever loaded.
 * The library picks between them at runtime from SIMD and thread support it
 * detects in the browser, and shipping only the likely one would strand
 * whichever machine detects differently — precisely the old hardware this is
 * meant to keep working. The four together are ~41 MB.
 */
const WANTED = [
  '/models/small',
  '/onnxruntime-web/ort-wasm.wasm',
  '/onnxruntime-web/ort-wasm-simd.wasm',
  '/onnxruntime-web/ort-wasm-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
];

const exists = p => fs.access(p).then(() => true, () => false);

async function main() {
  if (!(await exists(path.join(source, 'resources.json')))) {
    console.log(
      '[bg-model] @imgly/background-removal-data is not installed — skipping.\n' +
      '[bg-model] The Automatic cutout will report itself unavailable; the other two methods work.',
    );
    return;
  }

  const manifest = JSON.parse(await fs.readFile(path.join(source, 'resources.json'), 'utf8'));
  await fs.mkdir(dest, { recursive: true });

  const shipped = {};
  let copied = 0;
  let skipped = 0;
  let bytes = 0;

  for (const key of WANTED) {
    const entry = manifest[key];
    if (!entry) throw new Error(`[bg-model] "${key}" is missing from the data package manifest.`);
    shipped[key] = entry;

    for (const chunk of entry.chunks) {
      const from = path.join(source, chunk.hash);
      const to = path.join(dest, chunk.hash);
      const size = (await fs.stat(from)).size;
      bytes += size;

      // Content-addressed, so a file already present at the right size is by
      // definition the right file and does not need rewriting.
      const already = await fs.stat(to).then(s => s.size === size, () => false);
      if (already) { skipped++; continue; }

      await fs.copyFile(from, to);
      copied++;
    }
  }

  await fs.writeFile(path.join(dest, 'resources.json'), JSON.stringify(shipped), 'utf8');

  // Anything left over is from an earlier run that wanted a different set.
  const keep = new Set(Object.values(shipped).flatMap(e => e.chunks.map(c => c.hash)));
  keep.add('resources.json');
  let removed = 0;
  for (const name of await fs.readdir(dest)) {
    if (!keep.has(name)) { await fs.rm(path.join(dest, name)); removed++; }
  }

  console.log(
    `[bg-model] ${(bytes / 1e6).toFixed(1)} MB ready in public/bg-removal ` +
    `(${copied} copied, ${skipped} already current${removed ? `, ${removed} stale removed` : ''})`,
  );
}

main().catch(err => {
  console.error('[bg-model]', err.message);
  process.exit(1);
});
