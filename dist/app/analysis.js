import {
  cleanGeometry,
  matchingIoU,
  normalizeResult
} from './core.js';
import {
  asDataUrl,
  normalizeImage
} from './storage.js';
import {
  resource,
  portable
} from './resources.js';
import {
  recognizeLocalText
} from '../ocr/recognize.mjs';

const positions = [['左上方', '上方', '右上方'], ['左侧', '中央', '右侧'], ['左下方', '下方', '右下方']];
const band = n => n < .34 ? 0 : n > .66 ? 2 : 1;
function locationName(geom) {
  const [[x, y], [u, v]] = geom.points;
  return positions[band((y + v) / 2)][band((x + u) / 2)];
}

export function visualFindings(detections, signals) {
  const profiles = new Map(signals.profiles.map(p => [p.query, p]));
  const valid = [];
  const negatives = [];
  const ordered = [...detections].sort((a, b) => b.score - a.score);
  for (const {
      label,
      score,
      box
    } of ordered) {
    if (!box || !Number.isFinite(score) || score < 0.16) continue;
    const geom = cleanGeometry({
      type: 'region',
      points: [
        [box.xmin, box.ymin],
        [box.xmax, box.ymax]
      ]
    });
    if (geom.type !== 'region') continue;
    const [
      [x, y],
      [u, v]
    ] = geom.points;
    if ((u - x) * (v - y) > .87 || (u - x) * (v - y) < .0006) continue;
    const profile = profiles.get(label);
    if (!profile) {
      negatives.push({
        score,
        geom
      });
      continue
    }
    if (negatives.some(n => matchingIoU(geom, n.geom) > .46 && n.score >= score)) continue;
    if (valid.some(i => i.profile.concept === profile.concept || matchingIoU(i.geom, geom) > .48)) continue;
    valid.push({
      geom,
      profile,
      score
    });
    if (valid.length >= 4) break;
  }
  const details = valid.map(({
    geom,
    profile: p,
    score
  }) => ({
    kind: 'question',
    notice: p.notice,
    observation: '看画面' + locationName(geom) + '。框里可能是' + p.name + '。' + (p.look || '对照原图确认一下。'),
    goal: p.goal,
    interpretation: p.interpretation,
    hypothesis: p.hypothesis || '',
    unknown: '单张照片没有提供实际操作过程或使用者反应。',
    check: p.check,
    disconfirm: p.disconfirm,
    takeaway: p.takeaway,
    transfer: p.transfer,
    conceptIds: [p.concept],
    geometry: geom,
    signal: 'OWL-ViT · ' + p.query + ' · 匹配分 ' + score.toFixed(2)
  }));
  for (const rule of signals.pairs || []) {
    const matches = rule.ids.map(id => valid.find(v => v.profile.id === id));
    if (matches.some(v => !v)) continue;
    const pts = matches.map(({
      geom
    }) => [0, 1].map(i => (geom.points[0][i] + geom.points[1][i]) / 2));
    if (Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) < .08) continue;
    const names = matches.map(v => v.profile.name);
    const areas = matches.map(v => locationName(v.geom));
    details.unshift({
      kind: 'question',
      notice: rule.title,
      observation: areas[0] === areas[1] ? '画面' + areas[0] + '的两个标记可能是' + names.join('和') + '。沿着连线看看它们的位置。' :
        '模型在画面' + areas[0] + '标出疑似' + names[0] + '，在' + areas[1] + '标出疑似' + names[1] + '。沿线看两者之间的空间。',
      goal: rule.goal,
      interpretation: rule.interpretation,
      hypothesis: rule.hypothesis || '',
      disconfirm: rule.disconfirm,
      takeaway: rule.takeaway,
      unknown: '共同出现在一张照片里，不能证明两者的用途或因果关系。',
      check: rule.check,
      transfer: rule.transfer,
      conceptIds: [rule.concept],
      geometry: {
        type: 'relationship',
        points: pts
      }
    });
    break;
  }
  return {
    findings: details.slice(0, 4),
    limitation: valid.length ? '框是模型估计的位置，可选择观察点后校正。' : '模型没有找到足以定位的设计细节。可以拍近一些，把标识、操作部件和它影响的对象一起拍进去。'
  };
}
export function textFindings(lines, profile) {
  if (!profile?.pattern) return {
    findings: [],
    limitation: "这个视角未定义文字线索，请选择物件分析。"
  };
  const cues = new RegExp(profile.pattern, 'iu');
  const accepted = lines.filter(l => l.confidence >= .80 && cues.test(l.text) && l.text.length <= 130).sort((a, b) => b.confidence - a.confidence);
  const seen = new Set(),
    findings = [];
  for (const l of accepted) {
    if (seen.has(l.text.toLowerCase())) continue;
    const g = cleanGeometry({
      type: 'region',
      points: [
        [l.box.xmin, l.box.ymin],
        [l.box.xmax, l.box.ymax]
      ]
    });
    if (g.type !== 'region') continue;
    seen.add(l.text.toLowerCase());
    findings.push({
      kind: profile.kind,
      notice: '「' + l.text + '」指向哪里？',
      observation: '文字识别在标出的区域读到「' + l.text + '」。请在原图核对字样。',
      goal: profile.goal,
      interpretation: profile.interpretation,
      hypothesis: profile.hypothesis,
      unknown: profile.unknown,
      check: profile.check,
      transfer: profile.transfer,
      disconfirm: profile.disconfirm,
      takeaway: profile.takeaway,
      conceptIds: profile.conceptIds,
      geometry: g,
      signal: 'OCR · ' + l.confidence.toFixed(2)
    });
    if (findings.length >= 3) break;
  }
  return {
    findings,
    limitation: findings.length ? '这次只检验了可读的文字线索。' : '没有读到清晰且与动作有关的字样。可换用物件模型，或补拍能同时看清文字与对应部件的近照。'
  };
}
export function workerAnalysis(provider, image, signals, progress, signal) {
  return new Promise((resolve, reject) => {
    const url = portable ? URL.createObjectURL(new Blob([globalThis.WORLDLENS_PACK.worker], {
      type: 'text/javascript'
    })) : resource('app/vision-worker.js');
    const worker = new Worker(url, {
      type: 'module'
    });
    const finish = (fn, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (portable) URL.revokeObjectURL(url);
      signal?.removeEventListener('abort', abort);
      fn(result)
    };
    const abort = () => finish(reject, new Error('已取消分析。照片和笔记仍在本机。'));
    const timer = setTimeout(() => finish(reject, new Error('模型等待超时。请检查网络，或选择轻量文字识别。')), 240000);
    signal?.addEventListener('abort', abort, {
      once: true
    });
    if (signal?.aborted) {
      abort();
      return
    }
    worker.onmessage = ({
      data
    }) => {
      if (data.type === 'progress') progress(data.message);
      else if (data.type === 'result') finish(resolve, data.result);
      else finish(reject, new Error(data.message || '模型运行失败。'))
    };
    worker.onerror = () => finish(reject, new Error('无法启动设备模型。请检查网络和可用内存，或改用文字识别。'));
    worker.postMessage({
      provider,
      blob: image.blob,
      width: image.width,
      height: image.height,
      queries: [...signals.profiles.map(p => p.query), ...signals.background]
    });
  });
}
export async function availableLocal() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || portable) return {};
  try {
    const r = await fetch('./api/status', {
      signal: AbortSignal.timeout(2500)
    });
    return r.ok ? await r.json() : {}
  } catch {
    return {}
  }
}
export async function analyze({
  provider,
  photo,
  extra = [],
  context = '',
  lens,
  signals,
  progress,
  signal
}) {
  const main = await normalizeImage(photo);
  const normalizedExtras = await Promise.all(extra.slice(-2).map(e => normalizeImage(e.blob)));
  const inputPhotos = [main, ...normalizedExtras];
  let result, model, source = 'device';
  if (provider === 'ollama') {
    progress('正在由本机视觉语言模型分析…');
    const body = JSON.stringify({
      lensId: lens.id,
      context: context.slice(0, 1800),
      images: await Promise.all(inputPhotos.map(im => asDataUrl(im.blob)))
    });
    const r = await fetch('./api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body,
      signal
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || '本机模型没有返回结果。');
    result = data.result;
    model = data.model;
    source = 'local-server';
  } else {
    model = provider === 'objects' ? 'Xenova/owlvit-base-patch32' : (provider === 'native-text' ? 'Tesseract · 本机' : 'Tesseract LSTM · 设备');
    const batches = [];
    for (let i = 0; i < inputPhotos.length; i++) {
      const current = inputPhotos[i];
      if (current.contrast < 4 || current.width < 48 || current.height < 48) {
        batches.push({
          findings: [],
          limitation: '照片的细节或明暗差异不足，无法可靠辨认操作部件。请补充清晰且有周边环境的照片。'
        });
        continue
      }
      progress('正在检查' + (i ? '补图 ' + i : '主图') + '…');
      let raw;
      if (provider === 'native-text') {
        const r = await fetch('./api/text', {
          method: 'POST',
          body: current.blob,
          headers: {
            'Content-Type': 'image/jpeg'
          },
          signal
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || '本机文字识别失败。');
        raw = j.lines;
        source = 'local-server';
      } else if (provider === 'text') raw = await recognizeLocalText(current.blob, {
        signal,
        onProgress: phase => progress(phase === 'loading' ? '载入随工具提供的本机文字模型…' : '读取照片中的字样并定位…')
      });
      else raw = await workerAnalysis(provider, current, signals, progress, signal);
      const one = provider === 'objects' ? visualFindings(raw, signals) : textFindings(raw, signals.textProfile);
      if (i > 0) one.findings = one.findings.map(f => ({
        ...f,
        geometry: {
          type: 'global',
          points: []
        },
        observation: '补图 ' + i + '：' + f.observation.replace('框内', '补图中').replace('标出的区域', '补图中')
      }));
      batches.push(one);
    }
    const merged = [],
      seen = new Set();
    for (const batch of batches)
      for (const f of batch.findings) {
        const key = f.notice;
        if (!seen.has(key)) {
          merged.push(f);
          seen.add(key)
        }
      }
    result = {
      findings: merged,
      limitation: batches.filter(b => b.limitation).map((b, i) => batches.length > 1 ? (i ? '补图' : '主图') + ' · ' + b.limitation : b.limitation).join(' ')
    };
    if (context) result.limitation += ' 已附上你的现场记录。此设备模型只识别画面，文字作为独立证据保留。';
  }
  return {
    ...normalizeResult(result, lens),
    origin: 'inference',
    provider,
    source,
    model,
    at: new Date().toISOString(),
    lensId: lens.id,
    lensVersion: lens.version,
    context,
    extraIds: extra.slice(-2).map(e => e.id)
  };
}
