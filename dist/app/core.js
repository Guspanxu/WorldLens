export const VERSION = 1;
export const clamp = x => Math.min(1, Math.max(0, x));
export const freshId = () => globalThis.crypto.randomUUID();
export const copy = value => structuredClone(value);
export const dims = {
  point: [1, 1],
  region: [2, 2],
  relationship: [2, 6],
  structure: [3, 12],
  global: [0, 0]
};
export const geometryNames = {
  point: '位置',
  region: '区域',
  relationship: '关系',
  structure: '结构',
  global: '整体观察'
};
export const kindNames = {
  good: '有效设计',
  issue: '潜在困惑',
  detail: '设计细节',
  tradeoff: '设计权衡',
  question: '开放问题'
};

export function cleanGeometry(g) {
  if (!g || !Object.hasOwn(dims, g.type) || !Array.isArray(g.points)) return {
    type: 'global',
    points: []
  };
  const [min, max] = dims[g.type];
  if (g.points.length < min || g.points.length > max) return {
    type: 'global',
    points: []
  };
  if (!g.points.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= -0.035 && n <= 1.035))) return {
    type: 'global',
    points: []
  };
  const points = g.points.map(p => p.map(clamp));
  if (g.type === 'region') {
    const [
      [a, b],
      [c, d]
    ] = points;
    if (Math.abs(a - c) < 0.012 || Math.abs(b - d) < 0.012) return {
      type: 'global',
      points: []
    };
    return {
      type: 'region',
      points: [
        [Math.min(a, c), Math.min(b, d)],
        [Math.max(a, c), Math.max(b, d)]
      ]
    };
  }
  if (g.type === 'relationship' && Math.hypot(points[0][0] - points.at(-1)[0], points[0][1] - points.at(-1)[1]) < 0.016) return {
    type: 'global',
    points: []
  };
  if (g.type === 'structure') {
    const area = Math.abs(points.reduce((sum, [x, y], i) => {
      const [u, v] = points[(i + 1) % points.length];
      return sum + x * v - u * y
    }, 0)) / 2;
    if (area < 0.0004) return {
      type: 'global',
      points: []
    };
  }
  return {
    type: g.type,
    points
  };
}

export function anchor(g) {
  if (!g || !g.points.length) return null;
  return [0, 1].map(i => g.points.reduce((s, p) => s + p[i], 0) / g.points.length);
}

// Pins can move for legibility. Connecting lines always lead back to the measured coordinates.
export function placePins(items, width, height) {
  if (width <= 0 || height <= 0) return [];
  const placed = [];
  for (const item of items) {
    const center = anchor(item.geometry);
    if (!center) continue;
    const original = center.map((a, i) => a * (i === 0 ? width : height));
    const inset = Math.min(23, width / 2, height / 2);
    let best = null,
      bestGap = -1;
    for (const [dx, dy] of [
        [31, -33],
        [-31, -33],
        [31, 33],
        [-31, 33],
        [0, -56],
        [0, 56],
        [56, 0],
        [-56, 0],
        [0, 0]
      ]) {
      const x = Math.max(inset, Math.min(width - inset, original[0] + dx));
      const y = Math.max(inset, Math.min(height - inset, original[1] + dy));
      const gap = Math.min(Infinity, ...placed.map(q => Math.hypot(x - q.x, y - q.y)));
      if (gap > bestGap) {
        best = {
          id: item.id,
          x,
          y,
          original
        };
        bestGap = gap
      }
      if (gap >= 47) break;
    }
    placed.push(best);
  }
  return placed;
}

export function measureFit(w, h, imageW, imageH) {
  if (![w, h, imageW, imageH].every(v => Number.isFinite(v) && v > 0)) return {
    w: 0,
    h: 0,
    x: 0,
    y: 0
  };
  const s = Math.min(w / imageW, h / imageH);
  return {
    w: imageW * s,
    h: imageH * s,
    x: (w - imageW * s) / 2,
    y: (h - imageH * s) / 2
  };
}
export function pointerPosition(clientX, clientY, rect) {
  return [clamp((clientX - rect.left) / rect.width), clamp((clientY - rect.top) / rect.height)];
}

// Fit every selected evidence point in the close-up, including points on a photo edge.
export function detailFrame(geometry, imageWidth, imageHeight, width, height) {
  if (!geometry?.points?.length || geometry.type === 'global' ||
      ![width, height, imageWidth, imageHeight].every(v => Number.isFinite(v) && v > 0)) return null;
  const xs = geometry.points.map(p => p[0] * imageWidth);
  const ys = geometry.points.map(p => p[1] * imageHeight);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const minimum = Math.min(imageWidth, imageHeight) * .25;
  const scale = Math.min(width / Math.max(minimum, (right - left) * 1.3),
    height / Math.max(minimum, (bottom - top) * 1.3));
  const w = imageWidth * scale, h = imageHeight * scale;
  const offset = (center, total, frame) => total < frame ? (frame - total) / 2 :
    Math.max(frame - total, Math.min(0, frame / 2 - center * scale));
  return {w, h, x: offset((left + right) / 2, w, width), y: offset((top + bottom) / 2, h, height)};
}

export function normalizeResult(raw, lens) {
  if (!raw || !Array.isArray(raw.findings)) throw new Error('模型返回的观察结构不完整，请重新分析。');
  const codes = new Set(lens.concepts.map(c => c.id));
  const allowedKinds = lens.kinds ?? kindNames;
  const clean = (v, max = 650) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const findings = [];
  for (const item of raw.findings) {
    if (!item || !clean(item.notice) || !clean(item.observation) || !clean(item.interpretation)) continue;
    findings.push({
      id: 'f' + (findings.length + 1),
      kind: Object.hasOwn(allowedKinds, item.kind) ? item.kind : (Object.keys(allowedKinds).includes('question') ? 'question' : Object.keys(allowedKinds)[0]),
      notice: clean(item.notice, 64),
      observation: clean(item.observation),
      interpretation: clean(item.interpretation),
      hypothesis: clean(item.hypothesis),
      unknown: clean(item.unknown),
      check: clean(item.check),
      transfer: clean(item.transfer),
      ...Object.fromEntries(['goal', 'disconfirm', 'takeaway'].filter(k => clean(item[k])).map(k => [k, clean(item[k])])),
      conceptIds: [...new Set((Array.isArray(item.conceptIds) ? item.conceptIds : []).filter(x => codes.has(x)))].slice(0, 3),
      geometry: cleanGeometry(item.geometry),
      ...(item.signal ? {
        signal: clean(item.signal, 200)
      } : {})
    });
    if (findings.length === 5) break;
  }
  return {
    findings,
    limitation: clean(raw.limitation) || (!findings.length ? '这张照片还没有提供可定位的设计线索。请补一张包含操作部件、标识和周边关系的照片。' : '')
  };
}

export function createRecord({
  title,
  source,
  blob = null,
  imageUrl = null,
  lens,
  analysis = null
}) {
  return {
    schemaVersion: VERSION,
    id: freshId(),
    title,
    source,
    original: blob,
    imageUrl,
    lensId: lens.id,
    lensVersion: lens.version,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: [],
    reflection: '',
    context: '',
    extra: [],
    corrections: [],
    history: [],
    analysis,
    exposed: false
  };
}
export function replaceAnalysis(record, analysis) {
  if (record.analysis) record.history.push({
    at: new Date().toISOString(),
    analysis: copy(record.analysis),
    corrections: copy(record.corrections)
  });
  record.analysis = analysis;
  record.corrections = [];
  record.exposed = true;
}
export function matchingIoU(a, b) {
  const [
    [x1, y1],
    [x2, y2]
  ] = a.points, [
    [u1, v1],
    [u2, v2]
  ] = b.points;
  const intersect = Math.max(0, Math.min(x2, u2) - Math.max(x1, u1)) * Math.max(0, Math.min(y2, v2) - Math.max(y1, v1));
  return intersect / ((x2 - x1) * (y2 - y1) + (u2 - u1) * (v2 - v1) - intersect || 1);
}
