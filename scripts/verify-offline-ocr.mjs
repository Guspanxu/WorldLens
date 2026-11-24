import { readFile } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const [moduleDir, ...photos] = process.argv.slice(2);
if (!moduleDir || !photos.length) {
  console.error('Usage: node verify-offline-ocr.mjs PATH_TO_BROWSER_OCR PHOTO.jpg [PHOTO.png ...]');
  process.exit(2);
}
const dir = resolve(moduleDir);
const load = createRequire(import.meta.url);
const core = load(join(dir, 'tesseract-core-lstm.wasm.js'));
const data = await readFile(join(dir, 'eng.traineddata'));
const { runOcrModel } = await import(pathToFileURL(join(dir, 'engine.mjs')).href);
const result = [];
for (const file of photos) {
  const bytes = await readFile(file);
  const started = performance.now();
  const lines = await runOcrModel(bytes, core, data);
  const candidates = lines.filter(line => line.confidence >= .8 && /[A-Za-z0-9]{2,}/.test(line.text));
  for (const { box } of candidates) {
    if (box.xmin < 0 || box.ymin < 0 || box.xmax > 1 || box.ymax > 1 || box.xmin >= box.xmax || box.ymin >= box.ymax) throw Error('Invalid coordinates in '+basename(file));
  }
  result.push({file: basename(file), sha256: createHash('sha256').update(bytes).digest('hex'), runtimeMs:Math.round(performance.now()-started), recognizedLines: lines.length, candidates});
}
console.log(JSON.stringify(result, null, 2));
