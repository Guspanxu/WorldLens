import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importArchive} from '../dist/app/importer.js';
import {archiveRecord} from '../dist/app/storage.js';
import {createRecord} from '../dist/app/core.js';
const lens=JSON.parse(await readFile(new URL('../dist/lenses/designer.json',import.meta.url),'utf8'));
test('portable JSON round trip restores unmodified original bytes, supplements, notes, lens and history', async()=>{
  // Node lacks the DOM FileReader. This test adapter encodes the same FileReader data URL representation.
  const before=globalThis.FileReader;
  globalThis.FileReader=class {async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload()}};
  try {
    const original=await readFile(new URL('./fixtures/action-label.jpg',import.meta.url));
    const blob=new Blob([original],{type:'image/jpeg'});
    const r=createRecord({title:'牌子',source:{kind:'user',filename:'label.jpg'},blob,lens});
    r.extra.push({id:'e',label:'补图.jpg',blob,at:r.createdAt});
    r.notes.push({id:'n',text:'门上有字，但实际方向未知。',point:[.4,.7],phase:'independent',comparison:'alternative'});
    r.analysis={findings:[],limitation:'需要侧面照片。',origin:'inference',model:'fixture',at:r.createdAt};
    r.history=[{at:r.createdAt,analysis:r.analysis,corrections:[]}];
    const output=await archiveRecord(r,lens);
    const restored=importArchive(JSON.parse(JSON.stringify(output)),[lens]);
    assert.notEqual(restored.id,r.id);
    assert.deepEqual(Buffer.from(await restored.original.arrayBuffer()),original);
    assert.deepEqual(Buffer.from(await restored.extra[0].blob.arrayBuffer()),original);
    assert.deepEqual(restored.notes[0].point,[.4,.7]);assert.equal(restored.notes[0].comparison,'alternative');
    assert.equal(restored.history[0].analysis.limitation,r.analysis.limitation);assert.equal(output.lens.version,lens.version);
    const bad=structuredClone(output);bad.observation.photo.data='https://example.com/file.jpg';assert.throws(()=>importArchive(bad,[lens]));
  } finally {if(before)globalThis.FileReader=before;else delete globalThis.FileReader}
});
