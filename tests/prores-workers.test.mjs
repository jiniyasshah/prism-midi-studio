import test from 'node:test';
import assert from 'node:assert/strict';
import {WebWorker} from './helpers/web-worker.mjs';
import {exportMp4} from '../dist/export.js';
import {Input,BufferSource,ALL_FORMATS,EncodedPacketSink} from '../dist/vendor/mediabunny.mjs';

const width=128,height=72,rgba=new Uint8ClampedArray(width*height*4);
const options={canvas:{getContext:()=>({getImageData:()=>({data:rgba})})},draw:t=>{for(let i=0;i<rgba.length;i+=4)rgba.set([i%256,Math.floor(t*100),180,(i/4)%256],i);},width,height,fps:30,bitrate:25000000,transparent:true,transparentFormat:'prores',includeAudio:false,start:0,end:1,speed:1,onProgress:()=>{}};
async function packets(blob){
 const input=new Input({source:new BufferSource(await blob.arrayBuffer()),formats:ALL_FORMATS});
 try{const track=await input.getPrimaryVideoTrack();assert.equal((await track.getDecoderConfig()).codec,'ap4h');const result=[];for await(const p of new EncodedPacketSink(track).packets())result.push({timestamp:p.timestamp,duration:p.duration,bytes:Buffer.from(p.data)});return result;}finally{input.dispose();}
}
test('parallel ProRes keeps exact frame order and identical encoded alpha/color packets',async()=>{
 const serial=await exportMp4({...options,signal:new AbortController().signal});
 globalThis.Worker=WebWorker;
 try{
  const parallel=await exportMp4({...options,signal:new AbortController().signal});
  assert.deepEqual(await packets(parallel.blob),await packets(serial.blob));
  await Promise.all(WebWorker.closing);assert.equal(WebWorker.active,0,'workers terminated after finalizing');
 }finally{delete globalThis.Worker;}
});
test('cancelling a queued parallel export terminates workers and discards output',async()=>{
 globalThis.Worker=WebWorker;const abort=new AbortController();let frames=0;
 try{
  await assert.rejects(exportMp4({...options,signal:abort.signal,draw:t=>{options.draw(t);if(++frames===12)abort.abort();}}),{name:'AbortError'});
  await Promise.all(WebWorker.closing);assert.equal(WebWorker.active,0,'workers terminated after cancellation');
 }finally{delete globalThis.Worker;}
});
