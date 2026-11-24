// A classic worker keeps image bytes off the main thread and never transmits them.
self.onmessage = async ({data}) => {
  try {
    self.postMessage({type: 'progress', phase: 'loading'});
    importScripts('./tesseract-core-lstm.wasm.js');
    const [{runOcrModel}, model] = await Promise.all([
      import('./engine.mjs'), fetch(new URL('./eng.traineddata', self.location.href)),
    ]);
    if (!model.ok) throw new Error('无法载入随网站提供的文字模型。');
    const language = new Uint8Array(await model.arrayBuffer());
    self.postMessage({type: 'progress', phase: 'recognizing'});
    const lines = await runOcrModel(new Uint8Array(data.image), self.TesseractCore, language);
    self.postMessage({type: 'result', lines});
  } catch (error) {
    self.postMessage({type: 'error', message: error instanceof Error ? error.message : '设备上的文字识别失败。'});
  }
};
