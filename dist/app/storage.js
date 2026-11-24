import {
  VERSION
} from './core.js';
let dbPromise;

function db() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('worldlens-fieldnotes', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('observations', {
      keyPath: 'id'
    });
    req.onsuccess = () => {
      const handle = req.result;
      handle.onversionchange = () => {
        handle.close();
        dbPromise = null
      };
      resolve(handle)
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error)
    };
  });
  return dbPromise;
}
async function operation(mode, run) {
  const handle = await db();
  return new Promise((resolve, reject) => {
    const tx = handle.transaction('observations', mode);
    const req = run(tx.objectStore('observations'));
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('浏览器未能保存观察。'));
  });
}
export const saveRecord = record => operation('readwrite', store => store.put(record));
export const allRecords = () => operation('readonly', store => store.getAll());
export const getRecord = id => operation('readonly', store => store.get(id));
export const removeRecord = id => operation('readwrite', store => store.delete(id));
export function asDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob)
  });
}
export async function archiveRecord(record, lens) {
  const photo = record.original || await (await fetch(record.imageUrl)).blob();
  const {
    original,
    imageUrl,
    extra,
    ...rest
  } = record;
  return {
    format: 'worldlens.observation',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    lens: {
      id: lens.id,
      version: record.lensVersion,
      sources: lens.sources,
      status: lens.status
    },
    observation: {
      ...rest,
      photo: {
        name: record.source.filename ?? record.title,
        mime: photo.type,
        data: await asDataUrl(photo)
      },
      extra: await Promise.all(extra.map(async ({
        blob,
        ...meta
      }) => ({
        ...meta,
        data: await asDataUrl(blob)
      })))
    }
  };
}
export function downloadFile(blob, filename) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function normalizeImage(blob, maxEdge = 1400) {
  const url = URL.createObjectURL(blob);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const scale = Math.min(1, maxEdge / Math.max(im.naturalWidth, im.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(im.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(im.naturalHeight * scale));
    const ctx = canvas.getContext('2d', {
      willReadFrequently: true
    });
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    const {
      data
    } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let mean = 0,
      m2 = 0,
      n = 0;
    const stride = 4 * Math.max(1, Math.floor(canvas.width * canvas.height / 12000));
    for (let i = 0; i < data.length; i += stride) {
      const l = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      n++;
      const d = l - mean;
      mean += d / n;
      m2 += d * (l - mean)
    }
    const rendered = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .87));
    if (!rendered) throw new Error('浏览器无法解码此图片。');
    return {
      blob: rendered,
      width: canvas.width,
      height: canvas.height,
      contrast: Math.sqrt(m2 / Math.max(1, n))
    };
  } finally {
    URL.revokeObjectURL(url)
  }
}