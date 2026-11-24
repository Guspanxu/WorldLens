import {importArchive} from './importer.js';
import {
  copy,
  createRecord,
  cleanGeometry,
  dims,
  geometryNames,
  freshId,
  pointerPosition,
  replaceAnalysis
} from './core.js';
import {
  availableLocal,
  analyze
} from './analysis.js';
import {
  asDataUrl,
  saveRecord,
  allRecords,
  removeRecord,
  getRecord,
  archiveRecord,
  downloadFile,
  normalizeImage
} from './storage.js';
import {
  dataFile,
  resource,
  portable
} from './resources.js';
import {
  icon,
  escapeHtml as h
} from './icons.js';
import {
  detachCanvas,
  attachCanvas,
  refreshDetailCrops
} from './annotations.js';
import {
  studio,
  libraryView,
  guideView,
  btn,
  inline
} from './views.js';

const $ = selector => document.querySelector(selector),
  app = $('#app'),
  modal = $('#modal');
const s = {
  view: 'studio',
  mode: 'explore',
  revealed: false,
  visible: true,
  expanded: false,
  selected: null,
  layer: 'notice',
  rec: null,
  lenses: [],
  lens: null,
  samples: [],
  currentUrl: '',
  pick: null,
  pendingNotePoint: null,
  error: '',
  busy: false,
  status: '',
  local: {},
  guideConcept: null,
  provider: 'objects',
  journal: [],
  thumbs: [],
  persisted: false
};
let controller = null,
  toastTimer, saveTimer, epoch = 0,
  paintEpoch = 0,
  noteDraft = '',
  opening = 0;
const resources = new Set(),
  thumbUrls = [];
const urlFor = blob => {
  const u = URL.createObjectURL(blob);
  resources.add(u);
  return u
};

const exposureKey = 'worldlens.seen.v1';
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(exposureKey) || '[]')); } catch {}
function identity(rec) { return rec.source.caseId || rec.source.fingerprint || rec.id; }
function remember(rec) {
  rec.exposed = true;
  seen.add(identity(rec));
  try { localStorage.setItem(exposureKey, JSON.stringify([...seen].slice(-1000))); } catch {}
}
async function fingerprint(blob) {
  try { const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join(''); } catch { return ''; }
}
function releasePhotos() {
  for (const u of resources) URL.revokeObjectURL(u);
  resources.clear()
}

function clearThumbs() {
  for (const u of thumbUrls) URL.revokeObjectURL(u);
  thumbUrls.length = 0
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3600)
}

function showDialog(title, body) {
  $('#modal-body').innerHTML = '<div class="dialog-head"><h2 id="dialog-title">' + h(title) + '</h2><button class="icon-btn" data-act="close" aria-label="关闭">' + icon('close') + '</button></div>' + body;
  modal.setAttribute('aria-labelledby', 'dialog-title');
  if (!modal.open) modal.showModal()
}

function closeDialog() {
  if (modal.open) modal.close()
}

function status(msg) {
  s.status = msg;
  const p = $('#progress');
  if (p) p.textContent = msg
}

function cancelRun() {
  controller?.abort();
  controller = null;
  s.busy = false
}

function trackDraft() {
  if ($('#note-text')) noteDraft = $('#note-text').value;
  if ($('#reflection')) s.rec.reflection = $('#reflection').value.slice(0, 1800)
}
async function persist(manual = false) {
  if (!s.rec) return;
  clearTimeout(saveTimer);
  s.rec.updatedAt = new Date().toISOString();
  const rec = s.rec;
  try {
    if (!rec.original && rec.source.caseId) {
      const sample = s.samples.find(c => c.id === rec.source.caseId);
      const response = await fetch(resource(sample.image));
      if (!response.ok) throw Error('无法保存样本原图。');
      rec.original = await response.blob();
      rec.imageUrl = null;
    }
    await saveRecord(rec);
    if (s.rec === rec) s.persisted = true;
    if (manual) toast('已保存到这台设备的「我的手记」。')
  } catch {
    toast('浏览器未能保存，使用「导出」可以保留照片和记录。')
  }
}

function deferSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(), 300)
}

function navPaint() {
  document.querySelectorAll('[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === s.view);
    if (b.dataset.view === s.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current')
  });
  document.body.classList.toggle('gallery-open', s.expanded)
}

function render(track = true) {
  if (!s.rec) return;
  if (track) trackDraft();
  const focused = document.activeElement;
  let restore = null;
  if (focused instanceof HTMLButtonElement && app.contains(focused)) {
    if (focused.dataset.step) restore = '[data-step="' + focused.dataset.step + '"]:not(:disabled)';
    else if (focused.dataset.layer) restore = '[data-layer="' + focused.dataset.layer + '"]';
    else if (focused.dataset.mode) restore = '[data-mode="' + focused.dataset.mode + '"]';
    else if (focused.matches('.pin-dot[data-find]')) restore = '.pin-dot[data-find="' + CSS.escape(focused.dataset.find) + '"]';
    else if (['toggle', 'expand'].includes(focused.dataset.act)) restore = '[data-act="' + focused.dataset.act + '"]';
  }
  navPaint();
  if (s.view === 'studio') {
    app.innerHTML = studio(s);
    if ($('#note-text')) $('#note-text').value = noteDraft;
    attachCanvas(s);
    if (restore) requestAnimationFrame(() => {
      if (document.activeElement !== document.body) return;
      const next = app.querySelector(restore) || (focused.dataset.step && app.querySelector('[data-step]:not(:disabled)'));
      next?.focus({preventScroll: true});
    });
  } else if (s.view === 'guide') {
    detachCanvas();
    app.innerHTML = guideView(s.lens, s.guideConcept)
  } else {
    detachCanvas();
    app.innerHTML = libraryView(s.journal, s.thumbs)
  }
}
async function navigate(view, scroll = true) {
  if (!['studio', 'guide', 'library'].includes(view)) view = 'studio';
  trackDraft();
  s.expanded = false;
  s.pick = null;
  if (view === 'library') {
    if (s.persisted || s.rec.notes.length || s.rec.source.kind === 'user') await persist();
    const mine = ++paintEpoch;
    try {
      s.journal = (await allRecords()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      s.journal = [];
      toast('浏览器未开放本机存储。仍可导出当前观察。')
    }
    if (paintEpoch !== mine) return;
    clearThumbs();
    s.thumbs = s.journal.map(r => {
      if (r.original) {
        const u = URL.createObjectURL(r.original);
        thumbUrls.push(u);
        return u
      }
      return r.source.caseId ? resource(s.samples.find(c => c.id === r.source.caseId)?.image || '') : r.imageUrl
    });
  } else {
    paintEpoch++;
    clearThumbs()
  }
  s.view = view;
  if (location.hash !== '#' + view) {
    try {
      history.replaceState(null, '', '#' + view)
    } catch {}
  }
  render(false);
  if (scroll) window.scrollTo({
    top: 0
  });
}
async function settleRecord() {
  trackDraft();
  if (s.rec && (s.persisted || s.rec.notes.length || s.rec.source.kind === 'user')) await persist();
  cancelRun();
  clearTimeout(saveTimer);
  epoch++;
  releasePhotos();
  s.expanded = false;
  s.pick = null;
  s.pendingNotePoint = null;
  s.error = '';
  noteDraft = '';
}

function updatePhoto(rec, local = false) {
  s.rec = rec;
  s.persisted = local;
  s.revealed = false;
  s.visible = true;
  s.layer = 'notice';
  s.selected = rec.analysis?.findings[0]?.id || null;
  s.view = 'studio';
  s.currentUrl = rec.original ? urlFor(rec.original) : resource(s.samples.find(c => c.id === rec.source.caseId)?.image || rec.imageUrl);
  rec.exposed ||= seen.has(identity(rec));
  if (s.mode === 'explore' && rec.analysis) remember(rec);
  try {
    history.replaceState(null, '', '#studio')
  } catch {}
  render(false);
}
async function openCase(id) {
  const c = s.samples.find(x => x.id === id);
  if (!c) return;
  const n = ++opening;
  await settleRecord();
  if (n !== opening) return;
  const l = s.lenses.find(x => x.id === c.lensId) || s.lenses[0];
  s.lens = l;
  const a = {
    origin: 'editorial',
    model: 'WorldLens 人工导览',
    at: c.date,
    lensId: l.id,
    lensVersion: l.version,
    findings: copy(c.findings),
    limitation: c.limitation,
    context: '',
    extraIds: []
  };
  updatePhoto(createRecord({
    title: c.title,
    source: {
      kind: 'case',
      caseId: c.id,
      credit: c.credit,
      alt: c.alt,
      url: c.source,
      license: c.license,
      licenseUrl: c.licenseUrl,
      filename: c.image.split('/').pop()
    },
    imageUrl: resource(c.image),
    lens: l,
    analysis: a
  }));
}

function selectFinding(id, fromPhoto = false) {
  const f = s.rec.analysis?.findings.find(f => f.id === id);
  if (!f) return;
  s.selected = id;
  s.layer = 'notice';
  s.pick = null;
  if (fromPhoto) s.expanded = false;
  render();
  if (fromPhoto && window.innerWidth <= 820) {
    const copy = $('#reading-text');
    if (!copy) return;
    const bottomInset = window.innerWidth <= 640 ? $('.main-nav').offsetHeight + 10 : 12;
    const overflow = copy.getBoundingClientRect().bottom - window.innerHeight + bottomInset;
    const keepPhoto = $('#image-stage').getBoundingClientRect().bottom - Math.min(135, window.innerHeight * .2);
    const shift = Math.min(overflow, keepPhoto);
    if (shift > 0) window.scrollBy({top: shift, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
}

function getPhoto() {
  return s.rec.original ? Promise.resolve(s.rec.original) : fetch(s.currentUrl).then(r => {
    if (!r.ok) throw new Error('照片无法读取。');
    return r.blob()
  })
}
async function openUpload() {
  showDialog('观察你的照片', '<p>拍下一个让你好奇的物件，给它周围也留一点画面。</p><button class="drop" data-act="file">' + icon('upload', 27) + '<span>选一张照片</span><small>也可以把照片拖到这里</small></button><div class="upload-choice">' + btn('camera', '使用相机拍照', 'camera') + '</div><p class="dialog-foot">' + icon('lock', 15) + ' 照片和手记保存在这个浏览器。</p>');
  const drop = $('.drop');
  drop.ondragover = e => {
    e.preventDefault();
    drop.classList.add('drag')
  };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = e => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) takePhoto(e.dataTransfer.files[0])
  };
}
async function takePhoto(file, extra = false) {
  if (!file) return;
  try {
    if (file.size > 32 * 1024 * 1024 || file.size < 16) throw new Error('请选择 32 MB 以内的完整图片。');
    if (file.type === 'image/svg+xml') throw new Error('请使用普通照片格式，例如 JPEG 或 PNG。');
    await normalizeImage(file, 72);
    if (extra) {
      if (s.rec.extra.length >= 2) throw new Error('本次可加入两张补图。可先移除一张。');
      s.rec.extra.push({
        id: freshId(),
        label: file.name,
        blob: file,
        at: new Date().toISOString()
      });
      await persist();
      evidenceDialog();
      return
    }
    closeDialog();
    const n = ++opening;
    await settleRecord();
    if (n !== opening) return;
    const title = file.name.replace(/\.[^.]+$/, '').slice(0, 90) || '我的观察';
    updatePhoto(createRecord({
      title,
      source: {
        kind: 'user',
        filename: file.name,
        fingerprint: await fingerprint(file),
        alt: '上传的原始照片'
      },
      blob: file,
      lens: s.lens
    }));
    await persist();
    window.scrollTo({
      top: 0
    });
  } catch (e) {
    toast(e.message.includes('decode') ? '浏览器无法读取这张图片，可试试 JPEG 或 PNG。' : e.message)
  }
}

function providers() {
  const p = [
    ['objects', '物件与布局 · 视觉语言模型'],
    ['text', '文字线索 · 轻量，本机']
  ];
  if (s.local.ollama) p.push(['ollama', '完整场景推理 · 本机 Ollama']);
  return p;
}

function runDialog() {
  if (s.busy) return;
  const p = providers();
  const desc = {
    text: '适合有英文操作词或指示牌的照片。约 8 MB 的文字模型随工具提供，照片在设备上处理。',
    objects: 'OWL-ViT 会用照片和文字共同查找可定位部件。首次从 Hugging Face 和 jsDelivr 下载约 155 MB 权重及运行组件。照片在设备上处理。',
    ollama: '主图、最多两张补图和你的现场描述会交给这台电脑上运行的 Ollama。'
  };
  showDialog('选择观察方式', '<div class="field"><label for="provider">分析引擎</label><select id="provider">' + p.map(([id, name]) => '<option value="' + id + '" ' + (s.provider === id ? 'selected' : '') + '>' + h(name) + '</option>').join('') + '</select><p id="provider-help" class="hint">' + h(desc[s.provider] || desc.text) + '</p></div><div class="field"><label for="run-context">现场描述 <small>可选</small></label><textarea id="run-context" rows="2" maxlength="1800" placeholder="例如：我按了一次，灯过了一秒才亮。">' + h(s.rec.context) + '</textarea></div>' + btn('run', '开始分析', 'scan', 'btn'));
  $('#provider').onchange = e => {
    $('#provider-help').textContent = desc[e.target.value]
  };
}
async function run() {
  if (s.busy) return;
  s.provider = $('#provider')?.value || s.provider;
  s.rec.context = $('#run-context')?.value?.slice(0, 1800) ?? s.rec.context;
  closeDialog();
  s.revealed = true;
  s.pick = null;
  s.error = '';
  s.busy = true;
  s.status = '正在准备照片…';
  const token = ++epoch;
  const ctrl = new AbortController();
  controller = ctrl;
  render();
  try {
    const analysis = await analyze({
      provider: s.provider,
      photo: await getPhoto(),
      extra: s.rec.extra,
      context: s.rec.context,
      lens: s.lens,
      signals: s.lens.signals,
      progress: m => {
        if (epoch === token) status(m)
      },
      signal: ctrl.signal
    });
    if (token !== epoch || ctrl.signal.aborted) return;
    replaceAnalysis(s.rec, analysis);
    remember(s.rec);
    s.selected = analysis.findings[0]?.id || null;
    s.layer = 'notice';
    s.visible = true;
    await persist();
  } catch (e) {
    if (epoch === token && !ctrl.signal.aborted) s.error = e.message || '分析失败，可更换模型后重试。'
  } finally {
    if (epoch === token) {
      s.busy = false;
      controller = null;
      render()
    }
  }
}

function evidenceDialog() {
  const r = s.rec;
  showDialog('补充现场证据', '<p>写下你亲眼看到的过程，或补一张侧面、近景、操作后的照片。分析记录会保留版本。</p><div class="field"><label for="evidence-text">你在现场看到了什么？</label><textarea id="evidence-text" rows="3" maxlength="1800">' + h(r.context) + '</textarea></div><div class="stack">' + r.extra.map((e, i) => '<div class="sectionline"><span>补图 ' + (i + 1) + ' · ' + h(e.label) + '</span><button class="text-btn" data-extra-remove="' + h(e.id) + '">移除</button></div>').join('') + '</div><div class="actionbar">' + (r.extra.length < 2 ? btn('extra-file', '添加补图', 'image') : '') + btn('save-context', '保存证据', 'check', 'btn') + '</div>');
}

function correctDialog() {
  const f = selectedFinding();
  if (!f) return;
  showDialog('校正标注位置', '<p>在原图上重新指出「' + h(f.notice) + '」的位置。无法指向局部时可选整体观察。</p><div class="field"><label for="geometry">标注类型</label><select id="geometry">' + Object.entries(geometryNames).map(([key, v]) => '<option value="' + key + '" ' + (f.geometry.type === key ? 'selected' : '') + '>' + v + '</option>').join('') + '</select></div>' + btn('start-correct', '设置位置', 'pin', 'btn'));
}

function selectedFinding() {
  return s.rec.analysis?.findings.find(f => f.id === s.selected)
}

function setPick(type, purpose) {
  let count = type === 'structure' ? 4 : dims[type][0];
  const hints = {
    point: '点一下要标记的位置',
    region: '依次点选矩形的两个对角',
    relationship: '依次点选相连的两个元素',
    structure: '沿边缘依次点选布局的四个角'
  };
  s.pick = {
    type,
    purpose,
    points: [],
    count,
    message: hints[type] + ' · 0/' + count + '（Esc 取消）',
    hint: hints[type]
  };
  s.visible = true;
  closeDialog();
  render();
  $('#image-stage')?.scrollIntoView({
    block: 'nearest'
  });
}
async function applyCorrection(geo) {
  const f = selectedFinding();
  if (!f) return;
  s.rec.corrections.push({
    id: f.id,
    at: new Date().toISOString(),
    before: copy(f.geometry),
    after: copy(geo)
  });
  f.geometry = geo;
  s.pick = null;
  await persist();
  render();
  toast('已记录这次位置校正。');
}

function clickPhoto(e) {
  if (!s.pick || !e.target.closest('#photo-mount')) return false;
  const p = pointerPosition(e.clientX, e.clientY, $('#photo-mount').getBoundingClientRect()),
    pick = s.pick;
  pick.points.push(p);
  if (pick.points.length < pick.count) {
    pick.message = pick.hint + ' · ' + pick.points.length + '/' + pick.count;
    render();
    return true
  }
  if (pick.purpose === 'note') {
    s.pendingNotePoint = p;
    s.pick = null;
    render();
    $('#note-text')?.focus();
    return true
  }
  const g = cleanGeometry({
    type: pick.type,
    points: pick.points
  });
  if (g.type === 'global' && pick.type !== 'global') {
    toast('范围太小或顶点交叉，请重新点选。');
    setPick(pick.type, pick.purpose);
    return true
  }
  applyCorrection(g);
  return true;
}

function showPrivacy() {
  showDialog('照片和手记在哪里？', '<p>原始照片、补图、你的笔记、标注校正和分析历史保存在当前浏览器的 IndexedDB。清除网站数据或使用无痕模式会影响保存。</p><p>文字识别与 OWL-ViT 在你的设备上运行。下载模型时，资源服务会收到普通网络请求；照片和手记不随请求发送。</p><p>本机 Ollama 模式仅在启动本地服务并配置模型后出现。它会收到缩小后的照片与现场描述。导出的 JSON 包含原始照片和笔记，适合自己备份。</p>');
}

function share() {
  const site = globalThis.WORLDLENS_LIVE_URL || (['https:','http:'].includes(location.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? location.origin + location.pathname : '');
  if (!site) {
    showDialog('分享观察工具', '<p>把独立版 WorldLens.html 文件发给朋友，他们可用电脑浏览器打开。手机推荐通过已发布的网址访问。每个人的照片与手记仅在自己的设备上。</p>');
    return
  }
  showDialog('把 WorldLens 分享给朋友', '<p>朋友打开这个链接就能开始自己的观察。</p><div class="field"><label for="share-url">网站链接</label><input readonly type="text" id="share-url" class="share-input" value="' + h(site) + '"></div>' + btn('copy-link', '复制链接', 'share', 'btn'));
}
async function exportCurrent() {
  try {
    trackDraft();
    const a = await archiveRecord(s.rec, s.lens);
    downloadFile(new Blob([JSON.stringify(a, null, 2)], {
      type: 'application/json'
    }), 'WorldLens-' + s.rec.title.replace(/[^\p{L}\p{N}_-]/gu, '_') + '.json');
    toast('已导出原图、标注、笔记与分析历史。');
  } catch {
    toast('导出失败，浏览器未能读取原照片。')
  }
}
async function dispatch(act) {
  if (act === 'close') {
    closeDialog();
    return
  }
  if (act === 'upload' || act === 'new-practice') {
    if (act === 'new-practice') s.mode = 'practice';
    return openUpload()
  }
  if (act === 'file' || act === 'camera') {
    (act === 'file' ? $('#photo-input') : $('#camera-input')).click();
    return
  }
  if (act === 'toggle') {
    s.visible = !s.visible;
    render();
    return
  }
  if (act === 'expand') {
    s.expanded = !s.expanded;
    render();
    return
  }
  if (act === 'import') { $('#import-input').click(); return; }
  if (act === 'save') { closeDialog(); return persist(true); }
  if (act === 'export') { closeDialog(); return exportCurrent(); }
  if (act === 'cancel-pick') { s.pick = null; render(); return; }
  if (act === 'photo-menu') {
    showDialog('这张照片', '<div class="photo-menu">' + inline('save', '保存到我的手记', 'bookmark') +
      inline('export', '导出照片和手记', 'download') + (s.rec.source.kind === 'case' ? inline('photo-info', '照片出处', 'info') : '') + '</div>');
    return;
  }
  if (act === 'detail-photo') {
    const f = selectedFinding();
    if (!f?.geometry?.points?.length) return;
    showDialog('原图局部', '<div class="crop-window crop-modal" data-crop-window role="img" aria-label="' +
      '原图局部，' + h(f.notice) + '"></div><p class="crop-description">' + h(f.observation) + '</p>');
    refreshDetailCrops(s);
    return;
  }
  if (act === 'privacy') return showPrivacy();
  if (act === 'share') return share();
  if (act === 'copy-link') {
    const field = $('#share-url');
    field.select();
    try {
      await navigator.clipboard.writeText(field.value);
      toast('已复制网站链接。')
    } catch {
      if (document.execCommand('copy')) toast('已复制网站链接。');
      else toast('链接已选中，可手动复制。')
    }
    return
  }
  if (act === 'photo-info') {
    const r = s.rec;
    showDialog('照片出处', '<p>' + h(r.source.credit) + '</p><p>' + h(r.source.license) + '</p><a href="' + h(r.source.url) + '" target="_blank" rel="noopener">查看原始来源</a>' + (r.source.licenseUrl ? ' · <a href="' + h(r.source.licenseUrl) + '" target="_blank" rel="noopener">照片许可</a>' : ''));
    return
  }
  if (act === 'lens') {
    showDialog('观察视角', s.lenses.map(l => '<div class="field"><strong>' + h(l.name) + ' · ' + h(l.english) + '</strong><p class="hint">' + h(l.scope) + '</p><button class="outline" data-switch-lens="' + h(l.id) + '">' + (s.lens.id === l.id ? '查看框架' : '使用此视角') + '</button></div>').join(''));
    return
  }
  if (act === 'run-dialog') return runDialog();
  if (act === 'run') return run();
  if (act === 'cancel') {
    epoch++;
    cancelRun();
    s.error = '';
    render();
    toast('分析已取消。');
    return
  }
  if (act === 'skip-practice') {
    s.mode = 'explore';
    if (s.rec.analysis) remember(s.rec);
    s.pick = null;
    render();
    return
  }
  if (act === 'reveal') {
    if (!s.rec.notes.length) return;
    if (!s.rec.analysis) return runDialog();
    s.revealed = true;
    remember(s.rec);
    s.visible = true;
    await persist();
    render();
    return
  }
  if (act === 'mark-note') return setPick('point', 'note');
  if (act === 'add-note') {
    const text = $('#note-text')?.value.trim();
    if (!text) {
      $('#note-text')?.focus();
      toast('先写下一条观察或问题。');
      return
    }
    s.rec.notes.push({
      id: freshId(),
      at: new Date().toISOString(),
      text,
      point: s.pendingNotePoint,
      phase: s.rec.exposed ? 'after-viewing' : 'independent',
      comparison: ''
    });
    s.pendingNotePoint = null;
    noteDraft = '';
    await persist();
    render(false);
    return
  }
  if (act === 'correct') return correctDialog();
  if (act === 'start-correct') {
    const type = $('#geometry').value;
    closeDialog();
    if (type === 'global') return applyCorrection({
      type,
      points: []
    });
    return setPick(type, 'fix')
  }
  if (act === 'evidence') return evidenceDialog();
  if (act === 'extra-file') {
    s.rec.context = $('#evidence-text').value;
    $('#extra-input').click();
    return
  }
  if (act === 'save-context') {
    s.rec.context = $('#evidence-text').value.slice(0, 1800);
    closeDialog();
    await persist();
    render();
    toast('证据已保存，可重新分析生成新版本。');
    return
  }
  if (act === 'history') {
    showDialog('过去的分析版本', s.rec.history.slice().reverse().map(v => '<details class="media-details"><summary>' + h(v.analysis.model) + ' · ' + h(new Date(v.at).toLocaleString('zh-CN')) + '</summary>' + v.analysis.findings.map(f => '<p><strong>' + h(f.notice) + '</strong><br>' + h(f.observation) + '</p>').join('') + (v.analysis.context ? '<p>' + h(v.analysis.context) + '</p>' : '') + '</details>').join(''));
    return
  }
  if (act === 'all-concepts') {
    s.guideConcept = null;
    render();
    return
  }
  if (act === 'manual') {
    try {
      const r = await fetch(resource('guides/Designers-Eye.md'));
      if (!r.ok) throw new Error();
      downloadFile(await r.blob(), 'WorldLens-Designers-Eye.md')
    } catch {
      toast('无法读取观察手册。')
    }
    return
  }
}
document.addEventListener('click', async e => {
  if (clickPhoto(e)) return;
  const b = e.target.closest('button,a.brand');
  if (!b) return;
  try {
    if (b.matches('.brand')) {
      e.preventDefault();
      await navigate('studio');
      return
    }
    if (b.dataset.act) {
      await dispatch(b.dataset.act);
      return
    }
    if (b.dataset.view) {
      s.guideConcept = null;
      await navigate(b.dataset.view);
      return
    }
    if (b.dataset.mode) {
      if (s.busy) {
        toast('请等待分析完成或取消分析。');
        return
      }
      trackDraft();
      s.mode = b.dataset.mode;
      s.revealed = false;
      s.pick = null;
      s.pendingNotePoint = null;
      if (s.mode === 'explore' && s.rec.analysis) remember(s.rec);
      render(false);
      return
    }
    if (b.dataset.case) {
      await openCase(b.dataset.case);
      if (s.view === 'studio') {
        window.scrollTo({top: 0});
        $('#main').focus({preventScroll: true});
      }
      return
    }
    if (b.dataset.find) {
      selectFinding(b.dataset.find, b.matches('.pin-dot'));
      return
    }
    if (b.dataset.layer) {
      s.layer = b.dataset.layer;
      render();
      return
    }
    if (b.dataset.concept) {
      s.guideConcept = b.dataset.concept;
      await navigate('guide');
      return
    }
    if (b.dataset.switchLens) {
      const lens = s.lenses.find(l => l.id === b.dataset.switchLens);
      closeDialog();
      if (!lens) return;
      if (lens.id === s.lens.id) {
        s.guideConcept = null;
        await navigate('guide');
        return
      }
      const old = s.rec;
      await settleRecord();
      s.lens = lens;
      updatePhoto(createRecord({
        title: old.title,
        source: copy(old.source),
        blob: old.original,
        imageUrl: old.imageUrl,
        lens
      }));
      return
    }
    if (b.dataset.load) {
      const r = await getRecord(b.dataset.load);
      if (!r) {
        toast('这本手记已移除。');
        return
      }
      await settleRecord();
      s.lens = s.lenses.find(l => l.id === r.lensId) || s.lenses[0];
      updatePhoto(r, true);
      window.scrollTo({
        top: 0
      });
      return
    }
    if (b.dataset.remove) {
      showDialog('删除本机手记？', '<p>这会移除手记里的照片、笔记和历史。可先导出 JSON 留一份副本。</p><button class="btn" data-confirm-remove="' + h(b.dataset.remove) + '">删除这本手记</button>');
      return
    }
    if (b.dataset.confirmRemove) {
      const id = b.dataset.confirmRemove;
      closeDialog();
      if (id === s.rec.id) {
        await openCase(s.samples[0].id)
      }
      await removeRecord(id);
      await navigate('library');
      return
    }
    if (b.dataset.extraRemove) {
      s.rec.context = $('#evidence-text').value;
      s.rec.extra = s.rec.extra.filter(x => x.id !== b.dataset.extraRemove);
      await persist();
      evidenceDialog();
      return
    }
    if (b.dataset.notePin) {
      const n = s.rec.notes.find(x => 'note-' + x.id === b.dataset.notePin);
      if (n) showDialog('我的观察', '<p>' + h(n.text) + '</p>');
      return
    }
  } catch (e) {
    toast(e.message || '操作未能完成，请重试。')
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.compare) {
    const n = s.rec.notes.find(n => n.id === t.dataset.compare);
    if (n) {
      n.comparison = t.value;
      persist()
    }
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'reflection') {
    s.rec.reflection = e.target.value.slice(0, 1800);
    deferSave()
  }
});
for (const id of ['photo-input', 'camera-input', 'extra-input']) $('#' + id).onchange = e => {
  const f = e.target.files?.[0];
  e.target.value = '';
  takePhoto(f, id === 'extra-input')
};
$('#import-input').onchange = async e => {
  const f=e.target.files?.[0]; e.target.value=''; if(!f)return;
  try { if(f.size>135e6)throw Error('备份超过了导入大小限制。'); const r=importArchive(JSON.parse(await f.text()),s.lenses); await normalizeImage(r.original,48); await settleRecord(); s.lens=s.lenses.find(l=>l.id===r.lensId);updatePhoto(r,true);await persist();toast('已作为新手记导入。'); }
  catch(err){toast(err.message||'备份无法读取。')}
};
modal.onclick = e => {
  if (e.target === modal) closeDialog()
};
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.open) {
    if (s.pick) {
      s.pick = null;
      render()
    } else if (s.expanded) {
      s.expanded = false;
      render()
    }
  }
});
window.addEventListener('hashchange', () => {
  if (s.rec) navigate(location.hash.slice(1) || 'studio', false)
});
window.addEventListener('pagehide', () => {
  if (saveTimer && s.rec) persist()
});
async function init() {
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
  const initialView = location.hash.slice(1);
  const reg = await dataFile('lenses/index.json');
  s.lenses = await Promise.all(reg.map(async r => ({
    ...await dataFile(r.file),
    signals: await dataFile(r.signals)
  })));
  s.lens = s.lenses[0];
  s.samples = await dataFile('photos/cases.json');
  await openCase(s.samples[0].id);
  if (initialView && initialView !== 'studio') await navigate(initialView, false);
  s.local = await availableLocal();
}
init().catch(e => {
  app.textContent = '观察室未能打开。' + e.message
});
