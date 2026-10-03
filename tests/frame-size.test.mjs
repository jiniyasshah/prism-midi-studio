import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFrame,resolveCustomResolution,fitFrame} from '../dist/frame-size.js';
test('custom frames produce even video dimensions and matching preview bounds',()=>{
 for(const [w,h] of [[21,9],[4,5],[3,2],[1,1],[1.85,1]]){
  const frame=resolveFrame('custom',w,h,1920),preview=fitFrame(900,550,frame.ratio);
  assert.equal(frame.width%2,0);assert.equal(frame.height%2,0);assert.equal(Math.max(frame.width,frame.height),1920);
  assert.ok(preview.width<=900&&preview.height<=550);assert.ok(Math.abs(preview.width/preview.height-frame.ratio)<1e-10);
 }
 assert.deepEqual(resolveFrame('custom',4,5,1920),{width:1536,height:1920,ratio:.8});
});
test('existing presets stay compatible and invalid custom values cannot reach an encoder',()=>{
 assert.deepEqual(resolveFrame('1.7777777778',21,9,1920),{width:1920,height:1080,ratio:16/9});
 for(const [w,h] of [[0,9],[21,0],[-1,4],['',5],[Infinity,9],[1,1e20]])assert.throws(()=>resolveFrame('custom',w,h,1920));
});

test('exact pixel dimensions preserve portrait, landscape and square output without rounding',()=>{
 for(const [width,height] of [[1080,1920],[2560,1440],[2000,2000],[7680,4320]])assert.deepEqual(resolveCustomResolution(width,height),{width,height,ratio:width/height});
 for(const [width,height] of [[1081,1920],[1920,1081],[0,720],[1920.5,1080],[8194,2],[8192,8192],['',1080],[Infinity,100]])assert.throws(()=>resolveCustomResolution(width,height));
});
