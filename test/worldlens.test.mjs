import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  createRequire
} from 'node:module';
import {
  cleanGeometry,
  placePins,
  measureFit,
  normalizeResult,
  createRecord,
  replaceAnalysis,
  pointerPosition
} from '../dist/app/core.js';
import {
  visualFindings,
  textFindings
} from '../dist/app/analysis.js';
import {
  runOcrModel
} from '../dist/ocr/engine.mjs';
import {
  route
} from '../server/start.mjs';
import {
  generate
} from '../server/generator.mjs';
import {
  studio,
  guideView
} from '../dist/app/views.js';
const file = p => fs.readFile(new URL(p,
  import.meta.url));
const lens = JSON.parse(await file('../dist/lenses/designer.json')),
  signals = JSON.parse(await file('../dist/lenses/designer-signals.json')),
  cases = JSON.parse(await file('../dist/photos/cases.json'));
test('all verified source IDs, 9 dimensions and concept boundaries resolve', () => {
  assert.equal(lens.dimensions.length, 9);
  assert.equal(lens.concepts.length, 16);
  const sourceSet = new Set(lens.sources.map(s => s.id));
  for (const c of lens.concepts) {
    for (const key of ['meaning', 'distinction', 'signs', 'useWhen', 'counterexample', 'ask', 'check', 'transfer']) assert.ok(c[key], key + ' / ' + c.id);
    for (const s of c.sources) assert.ok(sourceSet.has(s));
    for (const i of c.chapters) assert.ok(i >= 1 && i <= 7)
  }
});
test('editorial records use actual photo files, unique IDs, valid coordinates and explicit provenance', async () => {
  for (const c of cases) {
    assert.ok((await file('../dist/' + c.image)).length > 2000);
    assert.ok(c.credit && c.license && c.source);
    assert.equal(new Set(c.findings.map(f => f.id)).size, c.findings.length);
    for (const f of c.findings) {
      assert.deepEqual(cleanGeometry(f.geometry), f.geometry);
      for (const id of f.conceptIds) assert.ok(lens.concepts.some(k => k.id === id))
    }
  }
  assert.equal(cases.find(c => c.id === 'clock').findings.length, 0);
});
test('small border errors clip; imprecise or invalid positions become global observations', () => {
  assert.deepEqual(cleanGeometry({
    type: 'region',
    points: [
      [-.02, .7],
      [.4, .2]
    ]
  }).points, [
    [0, .2],
    [.4, .7]
  ]);
  for (const g of [{
      type: 'point',
      points: [
        [2, 0]
      ]
    }, {
      type: 'region',
      points: [
        [.1, .1],
        [.1, .7]
      ]
    }, {
      type: 'point',
      points: [
        ['0.5', 0]
      ]
    }, {
      type: 'structure',
      points: [
        [0, 0],
        [.5, .5],
        [1, 1]
      ]
    }, {
      type: 'relationship',
      points: [
        [.2, .2],
        [.2, .2]
      ]
    }]) assert.equal(cleanGeometry(g).type, 'global');
});
test('portrait, landscape, wide and narrow viewports map normalized points back to image pixels', () => {
  for (const [w, h, iw, ih] of [
      [352, 260, 900, 1600],
      [1100, 390, 1000, 750],
      [390, 560, 600, 400],
      [840, 500, 600, 400]
    ]) {
    const r = measureFit(w, h, iw, ih);
    assert.ok(r.w <= w + 1e-8 && r.h <= h + 1e-8);
    assert.ok(Math.abs(r.w / r.h - iw / ih) < 1e-8);
    const rect = {
      width: r.w,
      height: r.h,
      left: r.x,
      top: r.y
    };
    const q = pointerPosition(r.x + .26 * r.w, r.y + .79 * r.h, rect);
    assert.ok(Math.abs(q[0] - .26) < 1e-8 && Math.abs(q[1] - .79) < 1e-8)
  }
});
test('coincident markers stay selectable while their original anchors and global locations are preserved', () => {
  const items = ['a', 'b', 'c'].map(id => ({
    id,
    geometry: {
      type: 'point',
      points: [
        [.5, .5]
      ]
    }
  }));
  items.push({
    id: 'global',
    geometry: {
      type: 'global',
      points: []
    }
  });
  const positions = placePins(items, 380, 200);
  assert.equal(positions.length, 3);
  assert.equal(new Set(positions.map(p => p.x + ',' + p.y)).size, 3);
  assert.ok(positions.every(p => p.original[0] === 190 && p.original[1] === 100));
});
test('provider gets no forced findings on negatives and keeps independent comparison data', () => {
  assert.equal(visualFindings([], signals).findings.length, 0);
  assert.equal(textFindings([{
    text: 'TREE',
    confidence: .99,
    box: {
      xmin: .1,
      ymin: .1,
      xmax: .8,
      ymax: .3
    }
  }], signals.textProfile).findings.length, 0);
  const normalized = normalizeResult({
    findings: [],
    limitation: 'insufficient'
  }, lens);
  assert.equal(normalized.findings.length, 0);
  const rec = createRecord({
    title: '现场',
    source: {
      kind: 'user'
    },
    lens
  });
  rec.notes.push({
    text: '不同的观察'
  });
  rec.analysis = {
    findings: [],
    model: 'first'
  };
  rec.corrections.push({
    id: 'test'
  });
  replaceAnalysis(rec, {
    findings: [],
    model: 'second'
  });
  assert.equal(rec.history[0].analysis.model, 'first');
  assert.equal(rec.history[0].corrections.length, 1);
  assert.equal(rec.notes[0].text, '不同的观察');
});
test('detector mapping merges duplicate boxes and computes grounded relationships; this is an adapter fixture', () => {
  const mk = (label, score, p) => ({
    label,
    score,
    box: {
      xmin: p[0],
      ymin: p[1],
      xmax: p[2],
      ymax: p[3]
    }
  });
  const r = visualFindings([mk('a coffee cup', .68, [.1, .2, .45, .7]), mk('a coffee cup', .52, [.1, .22, .46, .71]), mk('a spoon', .59, [.6, .2, .7, .8])], signals);
  assert.equal(r.findings.length, 3);
  assert.equal(r.findings[0].geometry.type, 'relationship');
  const dark = visualFindings([mk('a flower', .9, [.1, .2, .6, .7]), mk('a cup handle', .3, [.1, .2, .6, .7])], signals);
  assert.equal(dark.findings.length, 0);
});
test('the practice screen withholds annotations and case explanations before reveal', () => {
  const c = cases[0],
    r = createRecord({
      title: c.title,
      source: {
        kind: 'case',
        caseId: c.id
      },
      lens,
      analysis: {
        origin: 'editorial',
        findings: c.findings,
        model: 'editorial'
      }
    });
  const s = {
    rec: r,
    samples: cases,
    lens,
    mode: 'practice',
    revealed: false,
    visible: true,
    selected: c.findings[0].id,
    layer: 'notice',
    currentUrl: c.image
  };
  assert.ok(!studio(s).includes(c.findings[0].notice));
  assert.ok(studio(s).includes('先写下你的发现'));
  r.notes = [{
    id: 'n',
    text: '我注意到多个接触点',
    phase: 'independent'
  }];
  s.revealed = true;
  assert.ok(studio(s).includes(c.findings[0].notice));
  assert.ok(studio(s).includes('我发现了另一条线索'));
  assert.ok(studio(s).includes(r.notes[0].text));
  assert.ok(guideView(lens, null).includes('暂定版'));
});
test('a new lens controls its categories and concepts through its own contract', () => {
  const second = {
    id: 'example',
    concepts: [{
      id: 'pattern'
    }],
    kinds: {
      pattern: '可复核结构'
    }
  };
  const r = normalizeResult({
    findings: [{
      notice: '两种重复',
      kind: 'pattern',
      observation: '四个点',
      interpretation: '重复两次',
      conceptIds: ['pattern', 'affordance'],
      geometry: {
        type: 'global',
        points: []
      }
    }]
  }, second);
  assert.equal(r.findings[0].kind, 'pattern');
  assert.deepEqual(r.findings[0].conceptIds, ['pattern']);
});
test('server serves ordinary resources, protects local model writes and reports a missing model', async () => {
  for (const p of ['/', '/app/main.js', '/photos/cases.json', '/ocr/eng.traineddata', '/lenses/designer.json']) {
    const r = await route(new Request('http://127.0.0.1:4173' + p));
    assert.equal(r.status, 200, p);
    await r.body.cancel()
  }
  const cross = await route(new Request('http://127.0.0.1:4173/api/text', {
    method: 'POST',
    headers: {
      Origin: 'https://elsewhere.example'
    }
  }));
  assert.equal(cross.status, 403);
  assert.equal((await route(new Request('http://not-local.test/api/status'))).status, 403);
  assert.equal((await route(new Request('http://localhost/.env'))).status, 404);
  if (!process.env.WORLDLENS_OLLAMA_MODEL) assert.equal((await route(new Request('http://localhost/api/analyze', {
    method: 'POST'
  }))).status, 503);
});
test('Ollama transport contract sends real image fields and separates contextual evidence (mock transport)', async () => {
  let msg;
  const f = cases[0].findings[0];
  const fake = async (url, init) => {
    msg = JSON.parse(init.body);
    return Response.json({
      message: {
        content: JSON.stringify({
          findings: [f],
          limitation: ''
        })
      }
    })
  };
  const r = await generate(lens, '听到了响声', ['data:image/jpeg;base64,/9j/example'], 'model-for-contract-test', fake);
  assert.equal(msg.messages[1].images.length, 1);
  assert.ok(msg.messages[1].content.includes('听到了响声'));
  assert.equal(r.findings[0].geometry.type, f.geometry.type);
});
test('shipped neural OCR recognizes and grounds pixels unseen by the framework; natural negative abstains', async () => {
  const core = createRequire(
      import.meta.url)('../dist/ocr/tesseract-core-lstm.wasm.js'),
    language = await file('../dist/ocr/eng.traineddata');
  const output = await runOcrModel(await file('./fixtures/action-label.jpg'), core, language);
  const actual = textFindings(output, signals.textProfile);
  assert.equal(actual.findings.length, 1);
  assert.ok(actual.findings[0].notice.includes('PUSH TO OPEN'));
  const [
    [x, y],
    [u, v]
  ] = actual.findings[0].geometry.points;
  assert.ok(x > .06 && x < .14 && y > .29 && y < .40 && u > .70 && u < .82 && v > .47 && v < .6);
  const low = await runOcrModel(await file('../dist/photos/clock.png'), core, language);
  assert.equal(textFindings(low, signals.textProfile).findings.length, 0);
});