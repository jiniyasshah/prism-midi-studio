import test from 'node:test';
import assert from 'node:assert/strict';
import {createExportDestination} from '../dist/export-storage.js';
import {Output,MovOutputFormat,VideoSampleSource,VideoSample,Quality} from '../dist/vendor/mediabunny.mjs';
import {ensureProResEncoder,exportMp4} from '../dist/export.js';

function installStorage({failWrite=false,failEstimate=false}={}){
 const state={removed:[],writes:[],committed:false,aborted:false,estimateCalls:0};
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const writable={async write(chunk){if(failWrite)throw new DOMException('Actual quota exhausted','QuotaExceededError');state.writes.push({position:chunk.position,data:chunk.data.slice()});},async close(){state.committed=true;},async abort(){state.aborted=true;}};
 const root={async *entries(){yield [`prism-${Date.now()-90000000}-old.mov`,{kind:'file'}];yield ['unrelated.txt',{kind:'file'}];},async removeEntry(name){state.removed.push(name);},async getFileHandle(name){state.name=name;return {async createWritable(){return writable;},async getFile(){const length=Math.max(0,...state.writes.map(w=>w.position+w.data.length)),data=new Uint8Array(length);for(const w of state.writes)data.set(w.data,w.position);return new Blob([data]);}};}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{async getDirectory(){return {getDirectoryHandle:async()=>root};},async estimate(){state.estimateCalls++;if(failEstimate)throw Error('Estimate API unavailable');return {quota:1024,usage:1023};}}}});
 return {state,restore(){if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}};
}

test('ProRes writes to temporary storage despite a huge raw-size estimate and tiny reported quota',async()=>{
 const {state,restore}=installStorage({failEstimate:true});try{
  await ensureProResEncoder();const destination=await createExportDestination({estimatedBytes:100*1024**3,extension:'mov',mimeType:'video/quicktime'});
  assert.equal(destination.kind,'temporary');assert.equal(state.estimateCalls,0);assert.equal(state.removed.length,1);assert.ok(!state.removed.includes('unrelated.txt'));
  const output=new Output({format:new MovOutputFormat({fastStart:false}),target:destination.target});const source=new VideoSampleSource({codec:'prores',fullCodecString:'ap4h',alpha:'keep',quality:new Quality('high')});output.addVideoTrack(source,{frameRate:30});await output.start();
  const sample=new VideoSample(new Uint8Array(64*64*4),{format:'RGBA',codedWidth:64,codedHeight:64,timestamp:0,duration:1/30});try{await source.add(sample);}finally{sample.close();}source.close();await output.finalize();
  assert.equal(state.committed,false);const result=await destination.finish();assert.equal(state.committed,true);assert.ok(result.blob.size>100);assert.equal(result.blob.type,'video/quicktime');await result.cleanup();assert.ok(state.removed.includes(state.name));
 }finally{restore();}
});
test('actual quota exhaustion aborts and removes the partial export with an accurate message',async()=>{
 const {state,restore}=installStorage({failWrite:true});try{
  await assert.rejects(exportMp4({canvas:{getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(64*64*4)})})},draw(){},width:64,height:64,fps:30,bitrate:25000000,transparent:true,transparentFormat:'prores',includeAudio:false,start:0,end:1/30,speed:1,signal:new AbortController().signal,onProgress(){}}),/Browser temporary storage filled while writing/);
  assert.equal(state.committed,false);assert.equal(state.aborted,true);assert.ok(state.removed.includes(state.name));
 }finally{restore();}
});
test('direct file saving bypasses browser quota completely',async()=>{
 const {state,restore}=installStorage();let closed=false;try{
  const destination=await createExportDestination({fileHandle:{createWritable:async()=>({write:async()=>{},close:async()=>{closed=true;},abort:async()=>{}})},estimatedBytes:100*1024**3});assert.equal(destination.kind,'file');await destination.finish();assert.equal(closed,true);assert.equal(state.name,undefined);assert.equal(state.estimateCalls,0);
 }finally{restore();}
});
