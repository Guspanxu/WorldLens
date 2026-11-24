import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRecord, detailFrame, normalizeResult} from '../dist/app/core.js';
import {visualFindings} from '../dist/app/analysis.js';
import {studio} from '../dist/app/views.js';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [lens, samples, signals] = await Promise.all([
  load('../dist/lenses/designer.json'), load('../dist/photos/cases.json'), load('../dist/lenses/designer-signals.json')
]);

test('each reading stage reveals only its question and evidence, and old records remain readable', () => {
  const photo = samples[0], [first, second] = photo.findings;
  const record = createRecord({title:photo.title, source:{caseId:photo.id}, lens,
    analysis:{origin:'editorial', findings:photo.findings}});
  const state = {rec:record, samples, lens, currentUrl:photo.image, mode:'explore', visible:true,
    selected:first.id, layer:'notice'};
  const firstStage = studio(state);
  assert.ok(firstStage.includes(first.observation));
  assert.ok(!firstStage.includes(second.notice) && !firstStage.includes(first.interpretation));
  assert.ok(firstStage.includes('data-act="detail-photo"'));
  assert.match(firstStage, /disabled data-step="previous"/);
  const why = studio({...state, layer:'understand'});
  assert.ok(why.includes(first.goal) && why.includes(first.interpretation));
  assert.ok(!why.includes(first.disconfirm));
  const testStage = studio({...state, layer:'investigate'});
  assert.ok([first.hypothesis, first.check, first.disconfirm].every(v => testStage.includes(v)));
  const transfer = studio({...state, layer:'transfer'});
  assert.ok(transfer.includes(first.takeaway) && transfer.includes(first.transfer));
  const next = studio({...state, selected:second.id});
  assert.ok(next.includes(second.notice) && !next.includes(first.notice));
  const old = {notice:first.notice, observation:first.observation, interpretation:first.interpretation};
  const legacy = normalizeResult({findings:[old]}, lens).findings[0];
  assert.ok(!('goal' in legacy));
  record.analysis.findings = [legacy];
  const legacyView = studio({...state, layer:'understand', selected:legacy.id});
  assert.ok(legacyView.includes(first.interpretation) && !legacyView.includes('设想一个任务'));
  assert.ok(!studio({...state, selected:legacy.id}).includes('data-act="detail-photo"'));
});

test('detail loupe keeps the original source aspect and every anchor inside a wide or narrow viewport', () => {
  const geometries = [
    {type:'point', points:[[.99,.01]]},
    {type:'region', points:[[.04,.63],[.26,.99]]},
    {type:'relationship', points:[[.06,.25],[.94,.91]]},
    {type:'structure', points:[[.02,.02],[.8,.3],[.1,.95]]}
  ];
  for (const geo of geometries) for (const [iw,ih] of [[2416,1732],[710,1700],[1750,550]]) {
    for (const [w,h] of [[64,45],[303,210],[560,400]]) {
      const frame=detailFrame(geo,iw,ih,w,h);
      assert.ok(Math.abs(frame.w/frame.h - iw/ih) < 1e-8);
      for (const [x,y] of geo.points) {
        const px=frame.x+x*frame.w, py=frame.y+y*frame.h;
        assert.ok(px>=-1e-8 && px<=w+1e-8 && py>=-1e-8 && py<=h+1e-8);
      }
    }
  }
  assert.equal(detailFrame({type:'global',points:[]},800,600,180,120),null);
  assert.equal(detailFrame(geometries[0],0,0,64,45),null);
});

test('detector evidence changes with image position while the teaching method stays tied to the object', () => {
  const detect = (xmin,ymin) => normalizeResult(visualFindings([{label:'a coffee cup',score:.68,
    box:{xmin,ymin,xmax:xmin+.15,ymax:ymin+.2}}],signals),lens).findings[0];
  const left = detect(.1,.1), right = detect(.78,.73);
  assert.match(left.observation,/左上方/);
  assert.match(right.observation,/右下方/);
  for (const key of ['goal','hypothesis','check','disconfirm','takeaway','transfer']) {
    assert.ok(left[key] && left[key] === right[key],key);
  }
  for (const photo of samples) for (const finding of photo.findings) {
    for (const key of ['goal','hypothesis','check','disconfirm','takeaway','transfer']) {
      assert.ok(finding[key], photo.id + '/' + finding.id + ' missing ' + key);
    }
  }
});
