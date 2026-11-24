import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {visualFindings} from '../dist/app/analysis.js';
const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url),'utf8'));
test('real, recorded OWL-ViT room detections yield one grounded seating question', async () => {
  const evidence=await load('../docs/owl-room-evidence.json');
  const signals=await load('../dist/lenses/designer-signals.json');
  assert.ok(evidence.queries.every(query=>signals.profiles.some(p=>p.query===query)));
  const {width,height}=evidence.photo;
  const normalized=evidence.detections.map(({box,...rest})=>({...rest,box:{
    xmin:box.xmin/width,xmax:box.xmax/width,ymin:box.ymin/height,ymax:box.ymax/height
  }}));
  const result=visualFindings(normalized,signals);
  assert.equal(result.findings.length,1);
  assert.deepEqual(result.findings[0].geometry,{type:'region',points:[[382/512,198/386],[509/512,312/386]]});
  assert.equal(result.findings[0].kind,'question');
  assert.deepEqual(result.findings[0].conceptIds,['affordance']);
});
