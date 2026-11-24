import { icon, escapeHtml as h } from './icons.js';
import { kindNames, LOUPE_ZOOM } from './core.js';
import { resource } from './resources.js';

const btn = (act, label, glyph, cls = 'outline') =>
  `<button type="button" class="${cls}" data-act="${act}">${glyph ? icon(glyph) : ''}${h(label)}</button>`;
const inline = (act, label, glyph) => btn(act, label, glyph, 'text-btn');
const indexNumber = n => String(n).padStart(2, '0');

function iconAction(act, label, glyph) {
  return `<button class="icon-btn" type="button" data-act="${act}" aria-label="${h(label)}" title="${h(label)}">${icon(glyph, 19)}</button>`;
}

function heading(label, title, lead, action = '') {
  return `<header class="page-heading">
    <div><p class="section-label">${h(label)}</p><h1>${h(title)}</h1>
    ${lead ? `<p class="lead">${h(lead)}</p>` : ''}</div>${action}
  </header>`;
}

function modeControl(s) {
  const explore = s.mode === 'explore';
  return `<button class="mode-link" data-mode="${explore ? 'practice' : 'explore'}" aria-label="${explore ? '独立练习' : '自由探索'}">
    ${icon(explore ? 'pencil' : 'eye', 15)}${explore ? '先自己看' : '自由探索'}</button>`;
}

export function samplesView(s) {
  return `<section class="sample-section" aria-label="真实照片案例">
    <header class="section-heading"><h2>换个物件观察</h2></header>
    <div class="sample-grid">${s.samples.map(p => {
      const current = s.rec.source.caseId === p.id;
      return `<button class="sample-card" data-case="${h(p.id)}" aria-current="${current}" aria-label="${h(p.title)}">
        <span class="sample-image"><img loading="lazy" alt="" src="${h(resource(p.image))}"></span>
        <span class="sample-words"><strong>${h(p.shortTitle || p.title)}</strong><small>${h(p.collection)}</small></span>
        ${current ? `<span class="sample-current" title="正在观察" aria-label="正在观察">${icon('check',13)}</span>` : ''}
      </button>`;
    }).join('')}</div></section>`;
}

function photoView(s) {
  const guided = s.mode === 'explore' || s.revealed;
  const findings = guided ? s.rec.analysis?.findings || [] : [];
  const hasMarkers = findings.some(f => f.geometry?.points?.length) || s.rec.notes.some(n => n.point) || s.pendingNotePoint;
  const sample = s.samples.find(p => p.id === s.rec.source.caseId);
  let hint = sample ? sample.collection : '我的照片 · 本机保存';
  if (hasMarkers && guided && s.visible) hint = '点编号看线索';
  if (s.pick) hint = '在原图上标记';
  if (s.loupe) hint = '原图 · ' + LOUPE_ZOOM + '×';
  const toggleLabel = s.visible ? '隐藏标注' : '显示标注';
  const glassLabel = s.loupe ? '收起放大镜' : '自由放大原图';
  return `<figure class="plate" aria-label="${h(s.rec.title)}">
    <div id="image-stage" class="image-stage${s.loupe ? ' examining' : ''}">
      <div id="photo-mount" class="photo-mount" ${s.loupe ? 'tabindex="0" role="group" aria-label="移动放大镜，可用方向键，按 Escape 收起"' : ''}>
        <img id="original-photo" draggable="false" fetchpriority="high" src="${h(s.currentUrl)}" alt="${h(s.rec.source.alt || s.rec.title)}">
        <svg aria-hidden="true" class="layer" id="geo-layer"></svg><div class="pin-layer" id="pins"></div>
        ${s.loupe ? `<div class="glass-assembly" aria-hidden="true"><span class="glass-target"></span><span class="glass-stem"></span><span class="glass-window"><img draggable="false" src="${h(s.currentUrl)}" alt=""></span></div>` : ''}
      </div>
      ${s.pick ? `<div class="stage-task" role="status"><span>${h(s.pick.message)}</span>${inline('cancel-pick', '取消', 'close')}</div>` : ''}
      ${s.loupe ? `<div class="glass-instruction">拖动或轻点原图，查看细节</div>` : ''}
    </div>
    <figcaption class="photo-bar">
      <div class="subject-caption"><h1>${h(s.rec.title)}</h1><div class="photo-meta"><span>${h(hint)}</span>
        <i aria-hidden="true"></i>${modeControl(s)}</div></div>
      <div class="photo-tools">
        <button class="icon-btn" type="button" data-act="loupe" aria-pressed="${!!s.loupe}" aria-label="${glassLabel}" title="${glassLabel}">${icon('search',19)}</button>
        ${hasMarkers ? `<button class="icon-btn" data-act="toggle" aria-pressed="${s.visible}" aria-label="${toggleLabel}" title="${toggleLabel}">${icon(s.visible ? 'eye' : 'eyeoff', 19)}</button>` : ''}
        ${iconAction('expand', s.expanded ? '退出大图' : '放大查看原图', s.expanded ? 'close' : 'expand')}
        ${iconAction('photo-menu', '保存、导出与照片出处', 'more')}
      </div>
    </figcaption>
  </figure>`;
}

function lensBar(s, analysis) {
  const blind = s.mode === 'practice' && !s.revealed;
  const origin = analysis?.origin === 'editorial' ? '人工导览' : 'AI 观察';
  return `<div class="lens-bar">
    <button class="lens-switch" data-act="lens" title="查看或切换观察视角" aria-label="查看或切换观察视角，当前为${h(s.lens.name)}">
      ${icon('iris',18)}${h(s.lens.name)}${icon('chevron',13)}
    </button>${blind ? '<span class="origin-label">独立练习</span>' : analysis && !s.busy ?
      `<button class="origin-label" data-act="reading-source" aria-label="${origin}，查看来源与工具">${origin}${icon('info',13)}</button>` : ''}
  </div>`;
}

function paragraphs(label, value) {
  return value ? `<div class="evidence-part"><strong>${h(label)}</strong><p>${h(value)}</p></div>` : '';
}

function questionTitle(text) {
  const clauses = text.split('，');
  return clauses.map((clause, i) => '<span class="question-clause">' +
    h(clause) + (i < clauses.length - 1 ? '，' : '') + '</span>').join('');
}

function visibleClue(text) {
  const match = /^(看[^。]{1,13}。)(.+)$/u.exec(text);
  if (!match) return '<p>' + h(text) + '</p>';
  return '<p class="located-clue"><strong>' + h(match[1]) + '</strong><span>' + h(match[2]) + '</span></p>';
}

function reading(s, f) {
  const stages = s.lens.readingMethod?.stages || [
    {id: 'notice', label: '看线索'}, {id: 'understand', label: '想原因'},
    {id: 'investigate', label: '动手试'}, {id: 'transfer', label: '换场景'}
  ];
  let body;
  if (s.layer === 'understand') {
    const concepts = (f.conceptIds || []).map(id => s.lens.concepts.find(c => c.id === id)).filter(Boolean);
    const terms = concepts.length ? `<details class="reading-aside"><summary>背后的概念${icon('chevron', 14)}</summary>
      ${concepts.map(c => `<button class="concept-link" data-concept="${h(c.id)}">${icon('book',15)}${h(c.name)}</button>`).join('')}</details>` : '';
    body = paragraphs('设想一个任务', f.goal) + paragraphs('可能的原因', f.interpretation) + terms;
  } else if (s.layer === 'investigate') {
    const boundary = f.unknown ? `<details class="reading-aside"><summary>照片还没告诉我们什么${icon('chevron',14)}</summary><p>${h(f.unknown)}</p></details>` : '';
    body = paragraphs('先猜一次', f.hypothesis) + paragraphs('再去核对', f.check) +
      paragraphs('什么会改变这个判断', f.disconfirm) + boundary;
    if (!body) body = '<p>换个角度或操作一次，看看先前的判断是否成立。</p>';
  } else if (s.layer === 'transfer') {
    body = paragraphs('带走一个看法', f.takeaway) +
      paragraphs('换件东西试试', f.transfer || '找一个不同的物件，试着用同样的问题观察它。');
  } else {
    body = visibleClue(f.observation);
  }
  const idx = Math.max(0, stages.findIndex(step => step.id === s.layer));
  const stage = stages[idx];
  const next = stages[idx + 1] || stages[0];
  const actions = {understand: '为什么这样？', investigate: '怎样验证？', transfer: '换件东西试试', notice: '回看线索'};
  const local = !!f.geometry?.points?.length && f.geometry.type !== 'global' && s.layer === 'notice';
  const glass = local ? `<button data-act="detail-photo" class="evidence-glass" aria-label="放大细节" title="在原图上放大细节">
    <span class="crop-window" data-crop-window></span><span class="glass-badge">${icon('zoom',14)}</span></button>` : '';
  return `<div class="evidence-layout${local ? ' with-glass' : ''}">${glass}<div id="reading-text" class="detail-copy">${body}</div></div>
    <div class="reading-actions"><button class="read-on" data-layer="${h(next.id)}" data-forward>${h(actions[next.id] || next.label)}</button>
      <details class="stage-picker"><summary aria-label="观察步骤，当前为${h(stage.label)}"><span class="stage-marks" aria-hidden="true">${stages.map((_,i)=>`<i class="${i===idx?'current':''}"></i>`).join('')}</span>
        ${h(stage.label)}${icon('chevron',14)}</summary>
        <div class="stage-options" role="group" aria-label="观察层次">${stages.map(({id,label})=>
          `<button data-layer="${h(id)}" aria-pressed="${s.layer===id}" aria-controls="reading-text">${h(label)}${s.layer===id?icon('check',14):''}</button>`).join('')}</div>
      </details></div>`;
}

function stepButton(target, direction) {
  const next = direction === 'next';
  const label = next ? '下一处发现' : '上一处发现';
  return `<button type="button" class="step-btn" ${target ? `data-find="${h(target.id)}"` : 'disabled'} data-step="${direction}"
    aria-label="${label}" title="${label}">${icon(next ? 'right' : 'left', 18)}</button>`;
}

function focusNote(s, a) {
  const idx = Math.max(a.findings.findIndex(f => f.id === s.selected), 0);
  const f = a.findings[idx];
  if (!f) return `<div class="reader-content no-evidence"><span class="reader-label">观察结果</span><h2>这张图的线索还不够</h2>
    <p>${h(a.limitation || '请补充能看清细节的照片或现场信息。')}</p>${btn('evidence','补充证据','plus','reader-action')}</div>`;
  return `<div class="reader-content">
    <h2 class="finding-title" id="finding-title" aria-label="${h(f.notice)}">${questionTitle(f.notice)}</h2>
    ${reading(s, f)}
    <div class="discovery-nav"><span class="clue-count">线索 <b>${indexNumber(idx+1)}</b><span>/</span>${indexNumber(a.findings.length)}</span>
      ${a.findings.length>1 ? `<div class="step-controls">${stepButton(a.findings[idx-1], 'previous')}${stepButton(a.findings[idx+1], 'next')}</div>` : ''}
    </div></div>`;
}

const compareLabels = {
  '': '选择比较结果', shared: '我们关注了相同线索', additional: '我发现了另一条线索',
  alternative: '我有不同解释', unknown: '还需要证据'
};

function noteEntries(s, compare) {
  return s.rec.notes.map((n, i) => `<div class="note-entry">
    <small>笔记 ${i + 1} · ${n.phase === 'independent' ? '揭示前独立记录' : '看过导览后记录'}${n.point ? ' · 已定位' : ''}</small>
    <p>${h(n.text)}</p>${compare ? `<select data-compare="${h(n.id)}" aria-label="比较笔记 ${i + 1}">
      ${Object.entries(compareLabels).map(([value,label]) => `<option value="${value}" ${n.comparison === value ? 'selected' : ''}>${label}</option>`).join('')}</select>` : ''}
  </div>`).join('');
}

function practice(s) {
  return `<div class="reader-content practice-panel"><h2 class="finding-title">先写下你的发现</h2>
    <p class="prompt">哪一处细节让你停下来？先记下你能指给别人看的证据。</p>
    ${s.rec.exposed ? '<p class="hint">你已看过这张图的导览。换张新图可以先自己试一次。</p>' : ''}
    <div class="field"><label for="note-text">我的观察</label><textarea id="note-text" rows="3" maxlength="1800" placeholder="我注意到……"></textarea></div>
    <div class="actionbar">${btn('add-note','记下观察','check','reader-action')}${inline('mark-note',s.pendingNotePoint ? '重新定位' : '在照片上定位','pin')}</div>
    ${noteEntries(s,false)}<div class="practice-compare">${s.rec.notes.length ? btn('reveal',s.rec.analysis ? '展开导览并比较' : '分析照片并比较','layers','reader-secondary') : inline('skip-practice','直接探索这张图','eye')}</div></div>`;
}

function comparison(s) {
  return `<section class="comparison"><h2>我的比较</h2><p class="hint">自己的发现可以有不同的解释。</p>${noteEntries(s,true)}
    <div class="field"><label for="reflection">下一张图，我会先看什么？</label><textarea id="reflection" rows="2" maxlength="1800">${h(s.rec.reflection)}</textarea></div>
    ${inline('new-practice','换一张图练习','camera')}</section>`;
}

function analysisEmpty(s) {
  if (s.busy) return `<div class="reader-content analysis-empty" role="status"><span class="dot-busy"></span><h2>正在观察照片</h2>
    <p id="progress">${h(s.status)}</p>${btn('cancel','取消分析','close','reader-secondary')}</div>`;
  return `<div class="reader-content analysis-empty"><h2 class="finding-title">这张照片里，你注意到了什么？</h2>
    <p>让设计师之眼找出可以回到原图核对的线索。</p>${btn('run-dialog','分析这张照片','scan','reader-action')}
    <div>${inline('evidence','补充现场信息','plus')}</div></div>`;
}

export function sourceTools(s) {
  const a = s.rec.analysis;
  if (!a) return '';
  const source = a.origin === 'editorial' ? '这份导览由人工根据原图逐项编写。' : `${a.model} · ${new Date(a.at).toLocaleString('zh-CN')}`;
  const f = a.findings.find(x => x.id === s.selected);
  const category = f && (s.lens.kinds || kindNames)[f.kind];
  return `<div class="source-content">${paragraphs('观察来源',source)}${paragraphs('这条线索的类型',category)}
    ${paragraphs('目前能判断到哪里',a.limitation)}${paragraphs('你的现场描述',a.context)}
    <div class="actionbar">${f ? inline('correct','校正位置','pin') : ''}${inline('evidence','补充证据','plus')}${s.rec.history.length ? inline('history','历史版本','clock') : ''}</div>
    ${btn('run-dialog',a.origin==='editorial'?'用 AI 观察':'重新分析','scan','btn')}</div>`;
}

function panelView(s) {
  const a = s.rec.analysis;
  const blind = s.mode === 'practice' && !s.revealed;
  const body = blind ? practice(s) : (!a || s.busy ? analysisEmpty(s) : focusNote(s, a));
  return `<aside class="panel" id="inspector" aria-label="观察详情">
    <div class="reader">${lensBar(s,a)}${s.error ? `<div class="notice error" role="alert">${h(s.error)}${inline('run-dialog','更换方式并重试','adjust')}</div>` : ''}${body}</div>
    ${s.mode === 'practice' && s.revealed ? comparison(s) : ''}
  </aside>`;
}

export function studio(s) {
  return `<div class="studio-grid">${photoView(s)}${panelView(s)}</div>` + samplesView(s);
}

export function libraryView(records, thumbs) {
  const cards = records.map((r,i) => `<article class="journal-card">
    <button class="journal-cover" data-load="${h(r.id)}" aria-label="打开手记：${h(r.title)}"><img class="journal-img" src="${h(thumbs[i])}" alt=""></button>
    <div class="journal-copy"><small>${h(new Date(r.updatedAt).toLocaleDateString('zh-CN'))} · ${r.notes.length} 条笔记</small>
    <h2>${h(r.title)}</h2><div class="actionbar"><button class="outline" data-load="${h(r.id)}">打开手记</button>
    <button class="icon-btn" data-remove="${h(r.id)}" aria-label="删除这本手记">${icon('trash')}</button></div></div></article>`).join('');
  return heading('本机保存', '我的手记', '重新打开照片，接着写上次的发现。',btn('import','导入备份','upload')) +
    (records.length ? `<div class="journal-grid">${cards}</div>` : `<section class="library-empty"><span class="empty-icon">${icon('note',38)}</span>
      <div><h2>从第一张照片开始</h2><p>拍下一个让你好奇的物件，写下发现。下次打开，这本手记就在这里。</p>${btn('upload','拍照或选图','camera','btn')}</div></section>`);
}

export function guideView(l, focus) {
  const concepts = l.concepts.filter(c => !focus || c.id === focus);
  const fields = [['含义','meaning'],['容易混淆','distinction'],['可见迹象','signs'],['适用条件','useWhen'],['反例','counterexample'],['观察问题','ask'],['验证','check'],['迁移','transfer']];
  return heading('视角指南',l.name,l.scope) + `<div class="guide-layout">
    <aside class="guide-side"><div class="guide-id">${icon('aperture',27)}<strong>${h(l.english)}</strong></div>
    <p class="version">暂定版 · ${h(l.version)}</p><p>${h(l.sourceReview)}</p>${btn('manual','下载观察手册','download')}</aside>
    <div class="guide-main">${l.readingMethod ? `<section class="reading-method"><h2>${h(l.readingMethod.name)}</h2><p>${h(l.readingMethod.intro)}</p>
      <ol>${l.readingMethod.stages.map(step => `<li><strong>${h(step.label)}</strong><span>${h(step.question)}</span></li>`).join('')}</ol></section>` : ''}
    <h2>完整观察方法</h2><div class="method-list">${l.workflow.map((w,i) =>
      `<details class="method"><summary><span class="method-index">${indexNumber(i+1)}</span>${h(w.title)}${icon('chevron',17)}</summary><p>${h(w.detail)}</p></details>`).join('')}</div>
    <section class="concepts"><h2>观察概念</h2>${focus ? inline('all-concepts','查看全部概念','layers') : ''}
    <div class="guide-list">${concepts.map(c => `<details class="concept" ${focus ? 'open' : ''}><summary><span>${h(c.name)}<small>${h(c.english)}</small></span>${icon('chevron',17)}</summary>
      <div class="concept-body">${fields.map(([label,key]) => paragraphs(label,c[key])).join('')}
      <p class="citations">原著第 ${h(c.chapters.join('、'))} 章 · ${c.sources.map(id=>l.sources.find(x=>x.id===id)).filter(Boolean).map(x=>`<a target="_blank" rel="noopener" href="${h(x.url)}">${h(x.title)}</a>`).join(' / ')}</p></div></details>`).join('')}</div></section>
    <section><h2>框架与出处</h2><div class="guide-list">
      <details><summary>九个观察维度与知识边界${icon('chevron',17)}</summary>${l.dimensions.map(d=>paragraphs(d.label,d.prompt)).join('')}</details>
      <details><summary>案例与反例${icon('chevron',17)}</summary>${l.cases.map(c=>paragraphs(c.name,c.observation+' '+c.unknown)).join('')}</details>
      <details><summary>可核查来源${icon('chevron',17)}</summary>${l.sources.map(x=>`<p><a href="${h(x.url)}" target="_blank" rel="noopener">${h(x.title)}</a><br>${h(x.evidence)}</p>`).join('')}</details>
    </div></section></div></div>`;
}

export { btn, inline };
