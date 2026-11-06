import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {drawSmoke,smokePresets} from '../dist/smoke.js';
const require=createRequire(import.meta.url),modulePath=process.env.PRISM_CANVAS_MODULE;
test('smoke raster keeps partial alpha, different styles and repeatable seeking',{skip:!modulePath},()=>{
 const {createCanvas}=require(modulePath),previous=globalThis.OffscreenCanvas;globalThis.OffscreenCanvas=class{constructor(w,h){return createCanvas(w,h);}};
 try{
  const snapshots=[];
  for(const style of Object.keys(smokePresets)){
   const canvas=createCanvas(640,360),ctx=canvas.getContext('2d'),s={...smokePresets[style],smokeSeed:73};
   const draw=t=>{ctx.clearRect(0,0,640,360);drawSmoke(ctx,640,360,t,s);return ctx.getImageData(0,0,640,360).data.slice();};
   const first=draw(5);assert.ok(first.some((v,i)=>i%4===3&&v>0&&v<255));draw(91);assert.deepEqual(first,draw(5));snapshots.push(Buffer.from(first).toString('base64'));
   ctx.clearRect(0,0,640,360);drawSmoke(ctx,640,360,5,{...s,smokeEnabled:false});assert.ok(ctx.getImageData(0,0,640,360).data.every(v=>v===0));
  }
  assert.equal(new Set(snapshots).size,4);
 }finally{if(previous)globalThis.OffscreenCanvas=previous;else delete globalThis.OffscreenCanvas;}
});
