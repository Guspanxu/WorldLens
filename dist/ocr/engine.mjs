import { panelMasks, sourceBox } from './panels.mjs';

// The caller supplies decoded orientation through an upright JPEG or PNG. All files here are in WASM RAM.
function dimensions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 24 || bytes.byteLength > 12 * 1024 * 1024) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a && v.getUint32(12) === 0x49484452) return [v.getUint32(16), v.getUint32(20)];
  if (v.getUint16(0) !== 0xffd8) return null;
  let i = 2;
  const frames = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
  while (i + 4 < bytes.length && bytes[i] === 0xff) {
    while (i < bytes.length && bytes[i] === 0xff) i++;
    const tag = bytes[i++];
    if (tag === 0xda || tag === 0xd9 || i + 2 > bytes.length) return null;
    if (tag === 0x01 || (tag >= 0xd0 && tag <= 0xd7)) continue;
    const length = v.getUint16(i);
    if (length < 2 || i + length > bytes.length) return null;
    if (frames.includes(tag) && length >= 7) return [v.getUint16(i + 5), v.getUint16(i + 3)];
    i += length;
  }
  return null;
}

/** Does not select a concept or make a design claim. The least confident word controls the line score. */
export function readLines(tsv, width, height) {
  const lines = new Map();
  for (const row of tsv.split(/\r?\n/)) {
    const fields = row.split('\t');
    if (fields[0] !== '5' || fields.length < 12) continue;
    const text = fields.slice(11).join(' ').trim();
    const [x, y, w, h, score] = fields.slice(6, 11).map(Number);
    if (!text || ![x, y, w, h, score].every(Number.isFinite) || score < 0 || w <= 0 || h <= 0) continue;
    const xmin = Math.max(0, x / width), ymin = Math.max(0, y / height);
    const xmax = Math.min(1, (x + w) / width), ymax = Math.min(1, (y + h) / height);
    if (xmin >= xmax || ymin >= ymax) continue;
    const key = fields.slice(1, 5).join('/');
    let line = lines.get(key);
    if (!line) {
      line = { words: [], confidence: 1, box: { xmin, ymin, xmax, ymax } };
      lines.set(key, line);
    }
    line.words.push(text);
    line.confidence = Math.min(line.confidence, score / 100);
    line.box.xmin = Math.min(line.box.xmin, xmin);
    line.box.ymin = Math.min(line.box.ymin, ymin);
    line.box.xmax = Math.max(line.box.xmax, xmax);
    line.box.ymax = Math.max(line.box.ymax, ymax);
  }
  return Array.from(lines.values(), ({words, confidence, box}) => ({text: words.join(' '), confidence, box}));
}

export async function runOcrModel(imageBytes, coreFactory, languageData) {
  const size = dimensions(imageBytes);
  if (!size || size.some(n => n < 1 || n > 8192) || size[0] * size[1] > 16_777_216) throw new Error('图片格式或尺寸不适合识别。请使用较小的 JPEG 或 PNG。');
  const mod = await coreFactory({ print() {}, printErr() {} });
  const api = new mod.TessBaseAPI();
  try {
    mod.FS.writeFile('/eng.traineddata', languageData);
    if (api.Init('/', 'eng', 1) !== 0) throw new Error('本机文字模型未能初始化。');
    api.SetPageSegMode(11);
    mod.FS.writeFile('/input', imageBytes);
    if (api.SetImageFile(1, 0) !== 0) throw new Error('无法读取图片像素。');
    if (api.Recognize(null) !== 0) throw new Error('本机文字识别未完成。');
    const tsv = api.GetTSVText(0);
    if (tsv.length > 2 * 1024 * 1024) throw new Error('识别结果太多。请裁小图片后重试。');
    const lines = readLines(tsv, ...size);
    if (lines.some(line => line.confidence >= .8 && /[A-Za-z0-9]{2,}/.test(line.text))) return lines;
    const masks = panelMasks(mod, api);
    api.SetPageSegMode(7);
    for (const mask of masks) {
      mod.FS.writeFile('/input', mask.pgm);
      if (api.SetImageFile(1, 0) !== 0 || api.Recognize(null) !== 0) continue;
      const cropLines = readLines(api.GetTSVText(0), mask.targetW, mask.targetH);
      for (const line of cropLines) {
        if (line.confidence < .75 || !/[A-Za-z0-9]{2,}/.test(line.text)) continue;
        const box = sourceBox(line.box, mask, ...size);
        if (box.xmin < box.xmax && box.ymin < box.ymax) lines.push({...line, box});
      }
    }
    return lines;
  } finally {
    api.End();
    mod.destroy(api);
    for (const path of ['/input', '/eng.traineddata']) {
      try { mod.FS.unlink(path); } catch { /* Initialization may have failed before a file was created. */ }
    }
  }
}
