/** Genuine local English OCR. `source` is an upright JPEG/PNG Blob, ArrayBuffer or Uint8Array. */
export async function recognizeLocalText(source, {signal, onProgress} = {}) {
  if (signal?.aborted) throw new DOMException('文字识别已取消。', 'AbortError');
  if (!(globalThis.Worker && globalThis.WebAssembly)) throw new Error('此浏览器无法运行设备上的文字识别。');
  const size = source instanceof Blob ? source.size : source?.byteLength;
  if (!Number.isFinite(size) || size < 24 || size > 12 * 1024 * 1024) throw new Error('请提供 12 MB 以内的 JPEG 或 PNG。');
  let image;
  if (source instanceof Blob) image = await source.arrayBuffer();
  else if (source instanceof ArrayBuffer) image = source.slice(0);
  else if (source instanceof Uint8Array) image = new Uint8Array(source).buffer;
  else throw new TypeError('需要 JPEG 或 PNG 图片。');
  if (signal?.aborted) throw new DOMException('文字识别已取消。', 'AbortError');
  const bundled = globalThis.WORLDLENS_PACK?.ocrWorker;
  const script = bundled ? URL.createObjectURL(new Blob([bundled], {type:'text/javascript'})) : new URL('./worker.js', import.meta.url);
  const worker = new Worker(script);
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.terminate(); if(bundled) URL.revokeObjectURL(script); };
    const abort = () => { cleanup(); reject(new DOMException('文字识别已取消。', 'AbortError')); };
    const fail = (msg) => { cleanup(); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('本机文字识别超时。可尝试拍摄更清晰的近景。'), 75_000);
    signal?.addEventListener('abort', abort, {once: true});
    worker.onmessage = ({data}) => {
      if (data.type === 'progress') onProgress?.(data.phase);
      if (data.type === 'error') fail(data.message);
      if (data.type === 'result') { cleanup(); resolve(data.lines); }
    };
    worker.onerror = () => fail('本机文字模型载入失败。请检查网站资源是否完整。');
    worker.onmessageerror = () => fail('浏览器无法读取识别结果。');
    try { worker.postMessage({image}, [image]); } catch { fail('无法将图片交给本机识别。'); }
  });
}
