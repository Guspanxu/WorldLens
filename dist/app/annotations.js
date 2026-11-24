import {
  detailFrame,
  measureFit,
  loupeFrame,
  pointerPosition,
  placePins
} from './core.js';
import {
  escapeHtml as h
} from './icons.js';
let observer;
export function refreshDetailCrops(s) {
  const source = document.getElementById('original-photo');
  const finding = s.rec.analysis?.findings.find(f => f.id === s.selected);
  if (!finding || !source?.naturalWidth) return;
  for (const window of document.querySelectorAll('[data-crop-window]')) {
    const frame = detailFrame(finding.geometry, source.naturalWidth, source.naturalHeight,
      window.clientWidth, window.clientHeight);
    if (!frame) continue;
    let crop = window.querySelector('img');
    if (!crop) {
      crop = document.createElement('img');
      crop.alt = '';
      crop.src = source.currentSrc || source.src;
      window.append(crop);
    }
    Object.assign(crop.style, {width: frame.w + 'px', height: frame.h + 'px',
      left: frame.x + 'px', top: frame.y + 'px'});
  }
}
function attachLoupe(state, mount) {
  const glass = mount.querySelector('.glass-window');
  if (!state.loupe || !glass) return null;
  const stem = mount.querySelector('.glass-stem'), target = mount.querySelector('.glass-target');
  const crop = glass.querySelector('img');
  function paint() {
    const w = mount.clientWidth, h = mount.clientHeight;
    const f = loupeFrame(state.loupe, w, h);
    if (!f) return;
    Object.assign(glass.style, {width: f.size+'px', height: f.size+'px',
      left: (f.cx-f.size/2)+'px', top: (f.cy-f.size/2)+'px'});
    Object.assign(crop.style, {width: (w*f.zoom)+'px', height:(h*f.zoom)+'px',
      left: f.imageX+'px', top: f.imageY+'px'});
    Object.assign(target.style, {left: f.x+'px', top: f.y+'px'});
    Object.assign(stem.style, {left:f.x+'px', top:f.y+'px', width:Math.hypot(f.cx-f.x,f.cy-f.y)+'px',
      transform:'rotate('+Math.atan2(f.cy-f.y,f.cx-f.x)+'rad)'});
  }
  let grip = [0,0];
  const moveTo = event => {
    const point = pointerPosition(event.clientX, event.clientY, mount.getBoundingClientRect());
    state.loupe = point.map((v,i) => Math.min(1,Math.max(0,v + grip[i])));
    paint();
  };
  mount.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    mount.focus({preventScroll:true});
    const rect = mount.getBoundingClientRect();
    const f = loupeFrame(state.loupe, rect.width, rect.height);
    const press = pointerPosition(event.clientX, event.clientY, rect);
    const onGlass = f && Math.hypot(event.clientX-rect.left-f.cx,event.clientY-rect.top-f.cy) <= f.size/2;
    grip = onGlass ? state.loupe.map((v,i) => v-press[i]) : [0,0];
    mount.setPointerCapture(event.pointerId);
    moveTo(event);
  });
  mount.addEventListener('pointermove', event => {
    if (event.isPrimary && mount.hasPointerCapture(event.pointerId)) moveTo(event);
  });
  mount.addEventListener('keydown', event => {
    const directions = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,-1], ArrowDown:[0,1]};
    const step = directions[event.key];
    if (!step) return;
    event.preventDefault();
    const delta = event.shiftKey ? .1 : .025;
    state.loupe = state.loupe.map((v,i) => Math.max(0,Math.min(1,v + delta*step[i])));
    paint();
  });
  return paint;
}
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
  const paintGlass = attachLoupe(s, mount);
  let lastMarkup;
  const render = () => {
    if (!stage.isConnected) return;
    if (im.naturalWidth && im.naturalHeight && !s.expanded) {
      const wide = stage.clientWidth / Math.max(im.naturalWidth / im.naturalHeight, .1);
      const maximum = window.innerWidth <= 800 ? Math.min(550, Math.max(300, window.innerHeight * .54)) : Math.max(564, Math.min(685, window.innerHeight * .77));
      const stageHeight = Math.min(maximum, Math.max(180, Math.round(wide)));
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
    const aiVisible = !s.loupe && s.visible && (s.mode === 'explore' || s.revealed);
    const list = aiVisible ? (s.rec.analysis?.findings || []).map((f, i) => ({
      ...f,
      num: i + 1
    })) : [];
    if (s.visible && !s.loupe)
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
    if (s.pendingNotePoint && !s.loupe) list.push({
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
        stroke = 'stroke="#fff1cf" stroke-width="2.2" vector-effect="non-scaling-stroke"';
      if (g.type === 'region') {
        const [a, b] = points;
        shapes = '<rect x="' + a[0] + '" y="' + a[1] + '" width="' + (b[0] - a[0]) + '" height="' + (b[1] - a[1]) + '" rx="4" fill="#fff1cf" fill-opacity=".08" ' + stroke + '/>'
      }
      if (g.type === 'relationship' || g.type === 'structure') {
        const tag = g.type === 'structure' ? 'polygon' : 'polyline';
        shapes = '<' + tag + ' points="' + points.map(p => p.join(',')).join(' ') + '" fill="' + (g.type === 'structure' ? '#fff1cf1a' : 'none') + '" ' + stroke + '/>' + points.map(p => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="#fff1cf" stroke="#2c2119" stroke-width="1.3"/>').join('')
      }
    }
    const pins = placePins(list, w, height);
    for (const p of pins) {
      if (Math.hypot(p.x - p.original[0], p.y - p.original[1]) <= 4) continue;
      const color = p.id === active?.id ? '#fff1cf' : '#fff';
      shapes += line(p.original, [p.x, p.y], 'stroke="#35251b" stroke-width="3.2"') +
        line(p.original, [p.x, p.y], 'stroke="' + color + '" stroke-width="1.6"') +
        '<circle cx="' + p.original[0] + '" cy="' + p.original[1] + '" r="3" fill="' + color + '" stroke="#35251b" stroke-width="1.5"/>';
    }
    for (const p of s.pick?.points || []) {
      const q = pixel(p);
      shapes += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="5" stroke="white" stroke-width="2" fill="#ad4129"/>'
    }
    const svg = document.getElementById('geo-layer');
    if (!svg) return;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + height);
    svg.innerHTML = shapes;
    const pinLayer = document.getElementById('pins');
    const markup = s.pick ? '' : pins.map(p => {
      const f = list.find(x => x.id === p.id);
      return '<button class="pin-dot ' + (f.note ? 'note ' : '') + (p.id === active?.id ? 'selected' : '') + '" ' + (f.note ? 'data-note-pin' : 'data-find') + '="' + h(p.id) + '" style="left:' + p.x + 'px;top:' + p.y + 'px" aria-label="' + h(f.notice) + '"' + (f.note ? '' : ' aria-pressed="' + (p.id === active?.id) + '"') + '><b>' + h(f.num) + '</b></button>'
    }).join('');
    if (lastMarkup !== markup) {
      pinLayer.innerHTML = markup;
      lastMarkup = markup;
    }
    paintGlass?.();
    refreshDetailCrops(s);
  };
  if (im.complete) render();
  im.addEventListener('load', render, {
    once: true
  });
  observer = new ResizeObserver(render);
  observer.observe(stage);
  const modal = document.getElementById('modal');
  if (modal) observer.observe(modal);
}
