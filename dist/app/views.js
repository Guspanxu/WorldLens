import { icon, escapeHtml as h } from './icons.js';
import { kindNames } from './core.js';
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

function modes(s) {
  const choices = [['explore', 'eye', '自由探索'], ['practice', 'pencil', '独立练习']];
  return `<div class="mode" role="group" aria-label="学习模式">${choices.map(([id, glyph, title]) =>
    `<button data-mode="${id}" aria-pressed="${s.mode === id}">${icon(glyph, 17)}${title}</button>`).join('')}</div>`;
}

function subjectHeading(s) {
  const sample = s.samples.find(item => item.id === s.rec.source.caseId);
  const context = sample ? sample.collection : '保存在这台设备';
  return `<header class="subject-heading">
    <div class="subject-text">
      <p class="subject-meta"><span class="subject-type">${icon(sample ? 'collection' : 'image', 16)}${sample ? '观察样本' : '我的照片'}</span><span class="meta-divider" aria-hidden="true"></span>${h(context)}</p>
      <h1>${h(s.rec.title)}</h1>
    </div>${modes(s)}
  </header>`;
}

export function samplesView(s) {
  return `<section class="sample-section" aria-label="真实照片案例">
    <div class="section-heading"><h2>换个物件观察</h2></div>
    <div class="sample-grid">${s.samples.map(p => {
      const current = s.rec.source.caseId === p.id;
      return `<button class="sample-card" data-case="${h(p.id)}" aria-current="${current}">
        <span class="sample-image"><img loading="lazy" alt="" src="${h(resource(p.image))}">
          ${current ? `<span class="sample-current">${icon('check', 14)}当前样本</span>` : ''}
        </span><span class="sample-meta">${h(p.collection)}</span><strong>${h(p.title)}</strong></button>`;
    }).join('')}</div></section>`;
}

function photoView(s) {
  const aiVisible = s.mode === 'explore' || s.revealed;
  const findings = aiVisible ? s.rec.analysis?.findings || [] : [];
  const notes = s.rec.notes.some(n => n.point);
  const hasMarkers = findings.some(f => f.geometry?.points?.length) || notes;
  const hint = s.pick ? '在照片上选择位置' : !aiVisible ? '先独立观察这张照片' :
    hasMarkers && s.visible ? '点照片上的编号，读一个细节' : '原始照片';
  const toggleLabel = s.visible ? '隐藏标注' : '显示标注';
  return `<figure class="plate" aria-label="${h(s.rec.title)}">
    <div id="image-stage" class="image-stage">
      <div id="photo-mount" class="photo-mount">
        <img id="original-photo" fetchpriority="high" src="${h(s.currentUrl)}" alt="${h(s.rec.source.alt || s.rec.title)}">
        <svg aria-hidden="true" class="layer" id="geo-layer"></svg><div class="pin-layer" id="pins"></div>
      </div>
      ${s.pick ? `<div class="stage-task" role="status"><span>${h(s.pick.message)}</span>${inline('cancel-pick', '取消', 'close')}</div>` : ''}
    </div>
    <figcaption class="photo-bar">
      <span class="photo-hint">${icon(hasMarkers && s.visible && !s.pick ? 'point' : 'image', 18)}<span>${h(hint)}</span></span>
      <div class="photo-tools">
        ${(hasMarkers || s.pendingNotePoint) ? `<button class="tool-toggle" data-act="toggle" aria-pressed="${s.visible}" aria-label="${toggleLabel}" title="${toggleLabel}">${icon(s.visible ? 'eye' : 'eyeoff', 19)}<span>${toggleLabel}</span></button>` : ''}
        ${iconAction('expand', s.expanded ? '退出大图' : '放大查看原图', s.expanded ? 'close' : 'expand')}
        ${iconAction('photo-menu', '保存、导出与照片出处', 'more')}
      </div>
    </figcaption>
  </figure>`;
}

function lensBar(s, analysis) {
  const source = s.mode === 'practice' && !s.revealed ? '独立练习' :
    analysis?.origin === 'editorial' ? '人工导览' : analysis ? 'AI 观察' : '';
  return `<div class="lens-bar">
    <button class="lens-switch" data-act="lens" title="查看或切换观察视角" aria-label="查看或切换观察视角，当前为${h(s.lens.name)}">
      <span class="lens-symbol">${icon('aperture', 19)}</span>${h(s.lens.name)}${icon('chevron', 14)}
    </button>${source ? `<span class="origin-label">${source}</span>` : ''}
  </div>`;
}

function paragraphs(label, value) {
  return value ? `<div class="evidence-part"><strong>${h(label)}</strong><p>${h(value)}</p></div>` : '';
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
    body = `<p>${h(f.observation)}</p>`;
  }
  const local = f.geometry?.points?.length && f.geometry.type !== 'global' && s.layer === 'notice';
  const tools = s.layer !== 'notice' ? '' : `<div class="reading-actions">
    ${local ? `<button data-act="detail-photo" class="loupe-button"><span class="crop-window thumb-crop" data-crop-window></span>
      <span class="loupe-label"><strong>放大细节</strong></span>${icon('zoom',17)}</button>` : ''}
    <button class="read-on" data-layer="understand" data-forward>为什么这样？${icon('right',16)}</button></div>`;
  return `<div class="read-tabs" role="group" aria-label="观察层次">${stages.map(({id,label}) =>
    `<button data-layer="${h(id)}" aria-pressed="${s.layer === id}" aria-controls="reading-text">${h(label)}</button>`).join('')}</div>
    <div id="reading-text" class="detail-copy">${body}</div>${tools}`;
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
  const category = (s.lens.kinds || kindNames)[f.kind] || f.kind;
  return `<div class="reader-content">
    <div class="step-line"><div class="step-count"><span class="current-number">${indexNumber(idx + 1)}</span><span class="step-total">/ ${indexNumber(a.findings.length)}</span>
      <span class="kind-label">${h(category)}</span></div>
      ${a.findings.length > 1 ? `<div class="step-controls">${stepButton(a.findings[idx - 1], 'previous')}${stepButton(a.findings[idx + 1], 'next')}</div>` : ''}
    </div>
    <h2 class="finding-title" id="finding-title">${h(f.notice)}</h2>
    ${reading(s, f)}
  </div>`;
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

function sourceTools(s, a) {
  const empty = !a.findings.length;
  const source = a.origin === 'editorial' ? '这份导览由人工根据原图逐项编写。' : `${a.model} · ${new Date(a.at).toLocaleString('zh-CN')}`;
  return `<div class="reader-utilities"><details class="media-details"><summary>${icon('info', 17)}来源与工具${icon('chevron', 14)}</summary>
    <div class="tools-content">${paragraphs('这次观察的来源',source)}${!empty ? paragraphs('目前能判断到哪里',a.limitation) : ''}${paragraphs('你的现场描述',a.context)}
    <div class="actionbar">${empty ? '' : inline('correct','校正位置','pin') + inline('evidence','补充证据','plus')}${s.rec.history.length ? inline('history','历史版本','clock') : ''}</div>
    </div></details>${inline('run-dialog', a.origin === 'editorial' ? '用 AI 观察' : '重新分析','scan')}</div>`;
}

function panelView(s) {
  const a = s.rec.analysis;
  const blind = s.mode === 'practice' && !s.revealed;
  const body = blind ? practice(s) : (!a || s.busy ? analysisEmpty(s) : focusNote(s, a));
  return `<aside class="panel" id="inspector" aria-label="观察详情">
    <div class="reader">${lensBar(s,a)}${s.error ? `<div class="notice error" role="alert">${h(s.error)}${inline('run-dialog','更换方式并重试','adjust')}</div>` : ''}${body}</div>
    ${!blind && a && !s.busy ? sourceTools(s,a) : ''}
    ${s.mode === 'practice' && s.revealed ? comparison(s) : ''}
  </aside>`;
}

export function studio(s) {
  return subjectHeading(s) + `<div class="studio-grid">${photoView(s)}${panelView(s)}</div>` + samplesView(s);
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
