// The worker receives local pixels. Remote requests only load versioned code and open model weights.
const post = (type, data) => self.postMessage({
  type,
  ...data
});
self.onmessage = async ({
  data
}) => {
  const {
    provider,
    blob,
    width,
    height,
    queries
  } = data;
  try {
    if (provider === 'objects') {
      post('progress', {
        message: '正在载入设备模型，首次约需 155 MB 权重，另需运行组件…'
      });
      const {
        pipeline,
        env,
        RawImage
      } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
      const detector = await pipeline('zero-shot-object-detection', 'Xenova/owlvit-base-patch32', {
        quantized: true,
        progress_callback: p => {
          if (p.status === 'progress' && p.total > 5e6) post('progress', {
            message: '正在下载设备模型 · ' + Math.floor(p.progress || 0) + '%'
          });
        }
      });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      const pixels = ctx.getImageData(0, 0, width, height);
      const im = new RawImage(pixels.data, width, height, 4);
      post('progress', {
        message: '模型正在像素中寻找可定位的物件和部件…'
      });
      const output = await detector(im, queries, {
        threshold: 0.14,
        percentage: true
      });
      post('result', {
        result: output
      });
      if (detector.dispose) await detector.dispose();
      return;
    }
    throw new Error('不支持此模型。');
  } catch (e) {
    post('error', {
      message: '设备模型未完成分析。请确认可以下载模型并留有足够内存，或切换识别方式。' + (e?.message ? '（' + String(e.message).slice(0, 130) + '）' : '')
    })
  }
};