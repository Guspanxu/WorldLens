import {
  anchor,
  measureFit,
  placePins
} from './core.js';
import {
  escapeHtml as h
} from './icons.js';
let observer;
export function detachCanvas() {
  observer?.disconnect()
}
export function attachCanvas(s) {
  detachCanvas();
  const stage = document.getElementById('image-stage'),
    mount = document.getElementById('photo-mount'),
    im = document.getElementById('original-photo');
  if (!stage || !im) return;
  mount.classList.toggle('pick-hit', !!s.pick);
  const render = () => {
    if (im.naturalWidth && im.naturalHeight && !s.expanded) {
      const wide = stage.clientWidth / Math.max(im.naturalWidth / im.naturalHeight, .1);
      const maximum = window.innerWidth <= 760 ? 425 : 545;
      const stageHeight = Math.min(maximum, Math.max(218, Math.round(wide)));
      if (stage.style.height !== stageHeight + 'px') stage.style.height = stageHeight + 'px';
    }
    const {
      w,
      h: height,
      x,
      y
    } = measureFit(stage.clientWidth, stage.clientHeight, im.naturalWidth, im.naturalHeight);
    if (!w) return;
    Object.assign(mount.style, {
      width: w + 'px',
      height: height + 'px',
      top: y + 'px',
      left: x + 'px'
    });
    const aiVisible = s.visible && (s.mode === 'explore' || s.revealed);
    const list = aiVisible ? (s.rec.analysis?.findings || []).map((f, i) => ({
      ...f,
      num: i + 1
    })) : [];
    if (s.visible)
      for (const [i, n] of s.rec.notes.entries())
        if (n.point) list.push({
          id: 'note-' + n.id,
          geometry: {
            type: 'point',
            points: [n.point]
          },
          note: true,
          num: '✎',
          notice: '笔记 ' + (i + 1)
        });
    if (s.pendingNotePoint) list.push({
      id: 'note-draft',
      geometry: {
        type: 'point',
        points: [s.pendingNotePoint]
      },
      note: true,
      num: '+',
      notice: '待保存的笔记位置'
    });
    const line = (p, q, attr = '') => '<line x1="' + p[0] + '" y1="' + p[1] + '" x2="' + q[0] + '" y2="' + q[1] + '" ' + attr + '/>';
    const pixel = p => [p[0] * w, p[1] * height];
    const active = aiVisible ? list.find(f => f.id === s.selected) : null;
    let shapes = '';
    if (active && !s.pick) {
      const g = active.geometry,
        points = g.points.map(pixel),
        stroke = 'stroke="#b8492e" stroke-width="1.6" vector-effect="non-scaling-stroke"';
      if (g.type === 'region') {
        const [a, b] = points;
        shapes = '<rect x="' + a[0] + '" y="' + a[1] + '" width="' + (b[0] - a[0]) + '" height="' + (b[1] - a[1]) + '" rx="4" fill="#f6a673" fill-opacity=".11" ' + stroke + '/>'
      }
      if (g.type === 'relationship' || g.type === 'structure') {
        const tag = g.type === 'structure' ? 'polygon' : 'polyline';
        shapes = '<' + tag + ' points="' + points.map(p => p.join(',')).join(' ') + '" fill="' + (g.type === 'structure' ? '#eb9e6630' : 'none') + '" ' + stroke + '/>' + points.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="#b8492e"/>').join('')
      }
    }
    const pins = placePins(list, w, height);
    for (const p of pins)
      if (Math.hypot(p.x - p.original[0], p.y - p.original[1]) > 4) shapes += line(p.original, [p.x, p.y], 'stroke="#a24029" stroke-width="1.5"');
    for (const p of s.pick?.points || []) {
      const q = pixel(p);
      shapes += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="5" stroke="white" stroke-width="2" fill="#23553e"/>'
    }
    const svg = document.getElementById('geo-layer');
    if (!svg) return;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + height);
    svg.innerHTML = shapes;
    document.getElementById('pins').innerHTML = s.pick ? '' : pins.map(p => {
      const f = list.find(x => x.id === p.id);
      return '<button class="pin-dot ' + (f.note ? 'note ' : '') + (p.id === active?.id ? 'selected' : '') + '" ' + (f.note ? 'data-note-pin' : 'data-find') + '="' + h(p.id) + '" style="left:' + p.x + 'px;top:' + p.y + 'px" aria-label="' + h(f.notice) + '"><b>' + h(f.num) + '</b></button>'
    }).join('');
  };
  if (im.complete) render();
  im.addEventListener('load', render, {
    once: true
  });
  observer = new ResizeObserver(render);
  observer.observe(stage);
}