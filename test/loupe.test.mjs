import test from 'node:test';
import assert from 'node:assert/strict';
import {loupeFrame} from '../dist/app/core.js';

test('the glass can inspect every photo edge without moving the sample away from its optical center', () => {
  for (const [w,h] of [[735,527],[358,257],[120,520],[640,105],[52,48]]) {
    for (const point of [[0,0],[1,1],[.5,.5],[.03,.99],[.594,.678],[-.2,1.5]]) {
      const f=loupeFrame(point,w,h);
      const r=f.size/2;
      assert.ok(f.cx-r >= -1e-9 && f.cx+r <= w+1e-9 && f.cy-r >= -1e-9 && f.cy+r <= h+1e-9);
      assert.ok(Math.abs(f.imageX+f.x*f.zoom-r)<1e-8);
      assert.ok(Math.abs(f.imageY+f.y*f.zoom-r)<1e-8);
    }
    const a=loupeFrame([.5,.4999],w,h), b=loupeFrame([.5,.5001],w,h);
    assert.ok(Math.abs(a.cy-b.cy)<1);
  }
  for (const point of [null, {}, [NaN,0], [0]]) assert.equal(loupeFrame(point,320,240),null);
  assert.equal(loupeFrame([0,0],0,100),null);
});
