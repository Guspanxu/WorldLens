import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

const executables = ['/opt/homebrew/bin/tesseract', '/usr/local/bin/tesseract', '/usr/bin/tesseract'];
const maxInputBytes = 12 * 1024 * 1024;
const maxOutputBytes = 2 * 1024 * 1024;
const timeoutMs = 20_000;
const jpegFrameTypes = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function error(code, message) {
  return Object.assign(new Error(message), { code });
}

function dimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > maxInputBytes) return null;
  if (buffer.subarray(0, 8).equals(pngSignature) && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 < buffer.length && buffer[offset] === 0xff) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    const type = buffer[offset++];
    if (type === 0xda || type === 0xd9 || offset + 2 > buffer.length) return null;
    if (type === 0x01 || (type >= 0xd0 && type <= 0xd7)) continue;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (jpegFrameTypes.has(type) && length >= 7) {
      return [buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3)];
    }
    offset += length;
  }
  return null;
}

async function executable() {
  for (const candidate of executables) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch { /* Try the next supported installation prefix. */ }
  }
  throw error('OCR_NOT_INSTALLED', '未找到 Tesseract 本地程序。');
}

function parseLines(tsv, width, height) {
  const lines = new Map();
  for (const row of tsv.split(/\r?\n/)) {
    const fields = row.split('\t');
    if (fields[0] !== '5' || fields.length < 12) continue;
    const value = fields.slice(11).join(' ').trim();
    const [x, y, w, h, confidence] = fields.slice(6, 11).map(Number);
    if (!value || ![x, y, w, h, confidence].every(Number.isFinite) || confidence < 0 || w <= 0 || h <= 0) continue;
    const xmin = Math.max(0, x / width), ymin = Math.max(0, y / height);
    const xmax = Math.min(1, (x + w) / width), ymax = Math.min(1, (y + h) / height);
    if (xmin >= xmax || ymin >= ymax) continue;
    const key = fields.slice(1, 5).join('/');
    let line = lines.get(key);
    if (!line) {
      line = { words: [], confidence: 1, box: { xmin, ymin, xmax, ymax } };
      lines.set(key, line);
    }
    line.words.push(value);
    line.confidence = Math.min(line.confidence, confidence / 100);
    line.box.xmin = Math.min(line.box.xmin, xmin);
    line.box.ymin = Math.min(line.box.ymin, ymin);
    line.box.xmax = Math.max(line.box.xmax, xmax);
    line.box.ymax = Math.max(line.box.ymax, ymax);
  }
  return Array.from(lines.values(), ({ words, confidence, box }) => ({ text: words.join(' '), confidence, box }));
}

/** One result per text line. Confidence is the weakest word score, normalized to [0,1]. */
export async function recognizeText(buffer, { languages = process.env.WORLDLENS_OCR_LANG || 'eng' } = {}) {
  const size = dimensions(buffer);
  if (!size || size.some(n => n < 1 || n > 8192) || size[0] * size[1] > 16_777_216) {
    throw error('OCR_INVALID_IMAGE', '需要限制尺寸的 JPEG 或 PNG 图像。');
  }
  if (!/^[a-z]{3}(?:_[a-z]{2,8})?(?:\+[a-z]{3}(?:_[a-z]{2,8})?){0,3}$/.test(languages)) {
    throw error('OCR_INVALID_LANGUAGE', '需要已安装的 Tesseract 语言代码，例如 eng+swe。');
  }
  const path = await executable();
  return new Promise((resolve, reject) => {
    const child = spawn(path, ['stdin', 'stdout', '-l', languages, '--psm', '11', 'tsv'], {
      shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: { LANG: 'C', LC_ALL: 'C', OMP_THREAD_LIMIT: '1' },
    });
    let failure, stderr = '', bytes = 0;
    const chunks = [];
    const stop = (reason) => {
      if (!failure) failure = reason;
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => stop(error('OCR_TIMEOUT', '本地文字识别超时。')), timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      reject(error('OCR_FAILED', '无法运行本地 Tesseract。'));
    });
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= maxOutputBytes) chunks.push(chunk);
      else stop(error('OCR_OUTPUT_LIMIT', '文字过多，请裁小图片后重试。'));
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4096) stderr += chunk.toString('utf8', 0, 4096 - stderr.length);
    });
    child.stdin.on('error', () => { /* Report CLI errors once at close. */ });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (/Failed loading language|Error opening data file/i.test(stderr)) {
        return reject(error('OCR_LANGUAGE_UNAVAILABLE', 'Tesseract 缺少选定的语言数据。'));
      }
      if (code !== 0) return reject(error('OCR_FAILED', 'Tesseract 无法读取此图片。'));
      resolve(parseLines(Buffer.concat(chunks).toString('utf8'), ...size));
    });
    child.stdin.end(buffer);
  });
}
