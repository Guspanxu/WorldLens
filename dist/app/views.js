import {
  icon,
  escapeHtml as h
} from './icons.js';
import {
  kindNames,
  geometryNames
} from './core.js';
import {
  resource
} from './resources.js';
const btn = (act, label, ic, cls = 'outline') => '<button type="button" class="' + cls + '" data-act="' + act + '">' + (ic ? icon(ic) : '') + h(label) + '</button>';
const inline = (act, label, ic) => btn(act, label, ic, 'text-btn');
export function heading(code, title, lead, action = '') {
  return '<div class="heading"><div><div class="kicker"><i class="line"></i>' + h(code) + '</div><h1>' + h(title) + '</h1>' + (lead ? '<p class="lead">' + h(lead) + '</p>' : '') + '</div>' + action + '</div>';
}

function modes(s) {
  return '<div class="mode" role="group" aria-label="学习模式">' + [
    ['explore', 'compass', '自由探索'],
    ['practice', 'pencil', '独立练习']
  ].map(([id, ic, label]) => '<button data-mode="' + id + '" aria-pressed="' + (s.mode === id) + '" class="' + (s.mode === id ? 'on' : '') + '">' + icon(ic, 16) + label + '</button>').join('') + '</div>';
}
export function samplesView(s) {
  return '<section class="sample-section" aria-label="真实照片案例"><div class="sectionline"><h2 class="section-heading">观察样本</h2><span class="section-note">换一个场景，再看一次</span></div><div class="sample-strip">' + s.samples.map(p => '<button class="sample-card" data-case="' + h(p.id) + '" aria-current="' + (s.rec.source.caseId === p.id) + '"><img alt="" src="' + h(resource(p.image)) + '"><span class="sample-text"><strong>' + h(p.title) + '</strong><small>' + h(p.collection) + '</small></span></button>').join('') + '</div></section>';
}

function caption(s) {
  const r = s.rec,
    ref = r.source;
  return '<figcaption class="caption"><div><h2>' + h(r.title) + '</h2><small>' + h(ref.kind === 'case' ? (r.analysis?.origin === 'editorial' ? '人工导览' : '实景样本') + ' · ' + ref.credit : '我的照片 · ' + (ref.filename || '本机')) + '</small></div><div class="toolset">' + (ref.kind === 'case' ? '<button class="icon-btn" data-act="photo-info" title="照片出处" aria-label="照片出处">' + icon('info') + '</button>' : '') + '<button class="icon-btn" data-act="save" title="保存到我的手记" aria-label="保存到我的手记">' + icon('bookmark') + '</button><button class="icon-btn" data-act="export" title="导出照片和手记" aria-label="导出照片和手记">' + icon('download') + '</button></div></figcaption>';
}

function photoView(s) {
  const a = s.rec.analysis,
    hasAI = s.mode === 'explore' || s.revealed;
  const showToggle = hasAI && a?.findings.length > 0 || s.rec.notes.some(n => n.point);
  return '<figure class="plate"><div id="image-stage" class="image-stage" style="--stage:' + h(s.stageColor || '#e1e4da') + '"><div id="photo-mount" class="photo-mount"><img id="original-photo" src="' + h(s.currentUrl) + '" alt="' + h(s.rec.source.alt || s.rec.title) + '"><svg aria-hidden="true" class="layer" id="geo-layer"></svg><div class="pin-layer" id="pins"></div></div><div class="plate-tools">' + (showToggle ? '<button class="float-btn" data-act="toggle" aria-pressed="' + s.visible + '">' + icon(s.visible ? 'eye' : 'eyeoff', 16) + (s.visible ? '隐藏标注' : '显示标注') + '</button>' : '') + '<button class="float-btn" data-act="expand" aria-label="' + (s.expanded ? '退出大图' : '放大查看原图') + '" title="' + (s.expanded ? '退出大图' : '放大查看原图') + '">' + icon(s.expanded ? 'close' : 'expand', 16) + '</button></div>' + (s.pick ? '<div class="stage-task" role="status">' + h(s.pick.message) + '</div>' : '') + '</div>' + caption(s) + '</figure>';
}

function lensTop(s) {
  return '<div class="lensline"><span class="lens-icon">' + icon('aperture', 23) + '</span><div><strong>' + h(s.lens.name) + '</strong><small lang="en">' + h(s.lens.english) + '</small></div><button class="icon-btn" data-act="lens" aria-label="查看或切换观察视角" title="观察视角">' + icon('layers', 17) + '</button></div>';
}

function paragraphs(label, value) {
  return value ? '<p><span class="evidence-label">' + h(label) + '</span>' + h(value) + '</p>' : ''
}

function reading(s, f) {
  const labels = {
    notice: '看见',
    understand: '理解',
    investigate: '验证',
    transfer: '迁移'
  };
  let text = '';
  if (s.layer === 'notice') text = paragraphs('可核对的线索', f.observation);
  if (s.layer === 'understand') text = paragraphs('解释', f.interpretation) + f.conceptIds.map(id => s.lens.concepts.find(c => c.id === id)).filter(Boolean).map(c => '<button class="concept-badge" data-concept="' + h(c.id) + '">' + h(c.name) + '</button>').join('');
  if (s.layer === 'investigate') text = paragraphs('待验证的假设', f.hypothesis) + paragraphs('尚不清楚', f.unknown) + paragraphs('可以这样核实', f.check);
  if (s.layer === 'transfer') text = paragraphs('换一个场景试试', f.transfer) || '<p>换一张新照片，尝试独立提出一个可以检验的问题。</p>';
  return '<div class="reading"><div class="read-tabs" role="group" aria-label="观察层次">' + Object.entries(labels).map(([id, label]) => '<button class="small-tab ' + (s.layer === id ? 'active' : '') + '" data-layer="' + id + '" aria-pressed="' + (s.layer === id) + '">' + label + '</button>').join('') + '</div><div class="detail-copy">' + text + '</div><div class="reading-tools">' + inline('correct', '校正位置', 'pin') + inline('evidence', '补充证据', 'plus') + '</div></div>';
}

function rows(s, a) {
  const chosen = a.findings.find(f => f.id === s.selected) || a.findings[0];
  return '<div class="panel-heading"><h2>观察发现</h2><span class="count">' + a.findings.length + ' 处</span></div><div>' + a.findings.map((f, i) => '<button class="find-row ' + (f.id === chosen?.id ? 'active' : '') + '" data-find="' + h(f.id) + '" aria-pressed="' + (f.id === chosen?.id) + '"><span class="number">' + (i + 1) + '</span><span><strong>' + h(f.notice) + '</strong><small>' + h((s.lens.kinds ?? kindNames)[f.kind] || f.kind) + ' · ' + h(geometryNames[f.geometry.type]) + '</small></span><span class="chev">' + icon('chevron', 14) + '</span></button>').join('') + '</div>' + (chosen ? reading(s, chosen) : '');
}
const compareLabels = {
  '': '选择比较结果',
  shared: '我们关注了相同线索',
  additional: '我发现了另一条线索',
  alternative: '我有不同解释',
  unknown: '还需要证据'
};

function noteEntries(s, compare) {
  return s.rec.notes.map((n, i) => '<div class="note-entry"><small>笔记 ' + (i + 1) + ' · ' + (n.phase === 'independent' ? '揭示前独立记录' : '看过导览后记录') + (n.point ? ' · 已定位' : '') + '</small><div>' + h(n.text) + '</div>' + (compare ? '<select data-compare="' + h(n.id) + '" aria-label="比较笔记 ' + (i + 1) + '">' + Object.entries(compareLabels).map(([value, label]) => '<option value="' + value + '" ' + (n.comparison === value ? 'selected' : '') + '>' + label + '</option>').join('') + '</select>' : '') + '</div>').join('')
}

function practice(s) {
  return '<div class="practice-panel"><div class="panel-heading"><h2>先写下你的发现</h2>' + icon('pencil', 18) + '</div><p class="compact-text">任选一处细节。你看到了什么？什么证据会改变你的解释？</p>' + (s.rec.exposed ? '<small class="hint">你已看过这张图的导览。可换一张新图做独立练习。</small>' : '') + '<div class="field"><label for="note-text">我的观察</label><textarea rows="3" id="note-text" maxlength="1800" placeholder="我注意到……"></textarea></div><div class="actionbar">' + inline('mark-note', s.pendingNotePoint ? '已选择位置 · 重新定位' : '在照片上定位', 'pin') + btn('add-note', '记下观察', 'check') + '</div>' + noteEntries(s, false) + '<div class="comparison">' + (s.rec.notes.length ? btn('reveal', s.rec.analysis ? '展开导览并比较' : '分析照片并比较', 'layers', 'btn') : inline('skip-practice', '直接探索这张图', 'compass')) + '</div></div>';
}

function comparison(s) {
  return '<div class="comparison"><h2>我的比较</h2><p class="hint">保留你自己的发现。不同解释可以分别记录、继续验证。</p>' + noteEntries(s, true) + '<div class="field"><label for="reflection">下一张图，我会先看什么？</label><textarea id="reflection" rows="2" maxlength="1800" placeholder="记下想迁移的观察方法">' + h(s.rec.reflection) + '</textarea></div>' + inline('new-practice', '换一张图练习', 'camera') + '</div>'
}

function analysisEmpty(s) {
  if (s.busy) return '<div class="notice" role="status"><p><span class="dot-busy"></span><span id="progress">' + h(s.status) + '</span></p>' + inline('cancel', '取消分析', 'close') + '</div>';
  return '<div class="analysis-empty"><div class="panel-heading"><h2>从这张照片开始</h2></div><p class="compact-text">选择分析方式，寻找能在原图上核对的线索。</p>' + btn('run-dialog', '分析这张照片', 'scan', 'btn') + '<div class="reading-tools">' + inline('evidence', '补充现场信息', 'plus') + '</div></div>';
}

function panelView(s) {
  const a = s.rec.analysis,
    hidden = s.mode === 'practice' && !s.revealed;
  let content = hidden ? practice(s) : (!a || s.busy ? analysisEmpty(s) : rows(s, a));
  if (!hidden && a && !s.busy) {
    if (!a.findings.length) content += '<div class="notice"><p>' + h(a.limitation) + '</p>' + inline('evidence', '补充证据', 'plus') + '</div>';
    content += '<details class="media-details"><summary>' + h(a.origin === 'editorial' ? '人工导览 · 来源与边界' : a.model + ' · 分析记录') + '</summary>' + paragraphs('依据', a.origin === 'editorial' ? '根据本张真实照片逐项编写，供练习对照。' : a.model + ' · ' + new Date(a.at).toLocaleString('zh-CN')) + (a.findings.length ? paragraphs('本次边界', a.limitation) : '') + (a.context ? paragraphs('你提供的描述', a.context) : '') + '<div class="reading-tools">' + inline('run-dialog', '用 AI 重新观察', 'scan') + (s.rec.history.length ? inline('history', '查看历史版本', 'clock') : '') + '</div></details>';
    if (s.mode === 'practice' && s.revealed) content += comparison(s);
  }
  if (s.error) content = '<div class="notice error" role="alert">' + h(s.error) + '<div class="reading-tools">' + inline('run-dialog', '更换方式并重试', 'adjust') + '</div></div>' + content;
  return '<aside class="panel" id="inspector" aria-label="观察详情">' + lensTop(s) + content + '</aside>';
}
export function studio(s) {
  return heading('Observation studio', '日常观察室', '从一处细节开始，练习用设计师的眼睛看世界。', modes(s)) + '<div class="studio-grid">' + photoView(s) + panelView(s) + '</div>' + samplesView(s);
}
export function libraryView(records, thumbs) {
  return heading('Field journal', '我的手记', '在这台设备上保存的照片、观察和验证记录。',btn('import','导入备份','upload')) + (records.length ? '<div class="journal-grid">' + records.map((r, i) => '<article class="journal-card"><img class="journal-img" src="' + h(thumbs[i]) + '" alt=""><h3>' + h(r.title) + '</h3><small class="hint">' + new Date(r.updatedAt).toLocaleDateString('zh-CN') + ' · ' + r.notes.length + ' 条笔记 · ' + (r.analysis?.findings.length || 0) + ' 处发现</small><div class="actionbar"><button class="outline" data-load="' + h(r.id) + '">打开手记</button><button class="icon-btn" data-remove="' + h(r.id) + '" aria-label="删除这本手记">' + icon('trash') + '</button></div></article>').join('') + '</div>' : '<div class="empty-box library-empty"><h2>这里会留下你的第一张照片</h2><p>上传照片或在样本中记录发现，再回到这里继续观察。</p>' + btn('upload', '新建观察', 'plus', 'btn') + '</div>');
}
export function guideView(l, focus) {
  const concepts = l.concepts.filter(c => !focus || c.id === focus);
  return heading('Lens field guide', '视角指南', 'Designer’s Eye · ' + l.version + ' · 暂定版') + '<div class="guide-intro"><h2>' + h(l.name) + '</h2><p>' + h(l.scope) + '</p><p>' + h(l.sourceReview) + '</p></div><div class="guide-grid">' + l.workflow.map(w => '<article class="guide-card"><h3>' + h(w.title) + '</h3><p>' + h(w.detail) + '</p></article>').join('') + '</div><h2 class="section-sub">观察概念</h2>' + (focus ? inline('all-concepts', '查看全部概念', 'layers') : '') + '<div class="guide-list">' + concepts.map(c => '<details ' + (focus ? 'open' : '') + '><summary>' + h(c.name) + '<small>' + h(c.english) + '</small></summary>' + [
    ['含义', c.meaning],
    ['容易混淆', c.distinction],
    ['可见迹象', c.signs],
    ['适用条件', c.useWhen],
    ['反例', c.counterexample],
    ['观察问题', c.ask],
    ['验证', c.check],
    ['迁移', c.transfer]
  ].map(([k, v]) => paragraphs(k, v)).join('') + '<p>原著第 ' + h(c.chapters.join('、')) + ' 章 · ' + c.sources.map(id => l.sources.find(x => x.id === id)).filter(Boolean).map(x => '<a target="_blank" rel="noopener" href="' + h(x.url) + '">' + h(x.title) + '</a>').join(' / ') + '</p></details>').join('') + '</div><h2 class="section-sub">框架与出处</h2><div class="guide-list"><details><summary>九个观察维度与知识边界</summary>' + l.dimensions.map(d => paragraphs(d.label, d.prompt)).join('') + '</details><details><summary>案例与反例</summary>' + l.cases.map(c => paragraphs(c.name, c.observation + ' ' + c.unknown)).join('') + '</details><details><summary>可核查来源</summary>' + l.sources.map(x => '<p><a href="' + h(x.url) + '" target="_blank" rel="noopener">' + h(x.title) + '</a><br>' + h(x.evidence) + '</p>').join('') + '</details></div><div class="actionbar tip-bar">' + btn('manual', '下载完整观察手册', 'download') + '</div>';
}
export {
  btn,
  inline
};