import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exportTiming,audioWindow} from '../dist/export.js';

const source=await readFile(new URL('../dist/export.js',import.meta.url),'utf8');
async function mocked(){
  const state={frames:[],draws:[],supported:true,cancelled:false,notes:[],audio:[]};
  globalThis.__exportTest=state;
  const stub=`
const state=globalThis.__exportTest;
function scheduleAudioBuffer(...args){state.externalArgs=args;}
class Quality {constructor(options){this.options=options;}}
const canEncodeVideo=async(codec)=>{state.codec=codec;return state.supported;},canEncodeAudio=async()=>state.audioSupported!==false;
async function createExportDestination(options){state.destinationOptions=options;state.destination=true;return {target:new BufferTarget(),kind:'file',finish:async()=>({saved:true}),abort:async()=>{state.aborted=true;}};}
class BufferTarget {buffer=new Uint8Array([0,0,0,24,102,116,121,112]).buffer;}
class Mp4OutputFormat {}
class WebMOutputFormat {}
class Output {constructor({target,format}){this.target=target;state.format=format.constructor.name;}addVideoTrack(){}addAudioTrack(){}async start(){}async finalize(){state.finalized=true;}async cancel(){state.cancelled=true;}}
class CanvasSource {constructor(canvas,config){state.videoConfig=config;}async add(t,d){state.frames.push([t,d]);state.onFrame?.();}close(){}}
class AudioBufferSource {async add(b){state.audio.push(b);}close(){}}
class Synth {async init(ctx){this.ctx=ctx;this.master={gain:{}};this.wet={gain:{}};}play(n,tr,t,d){state.notes.push({pitch:n.pitch,track:tr.id,t,d});}stop(){}}
`;
  const code=stub+source.replace(/^import .*;\n/gm,'');
  return {state,module:await import('data:text/javascript;base64,'+Buffer.from(code+'\n//'+Math.random()).toString('base64'))};
}
const options=state=>({canvas:{},draw:t=>state.draws.push(t),width:1920,height:1080,fps:30,bitrate:25000000,includeAudio:false,signal:new AbortController().signal,onProgress(){},start:3,end:4,speed:2});

test('range and speed produce exact frame timestamps, padded by less than one frame',()=>{
  const t=exportTiming(3,4.01,2,60);assert.equal(t.frames,31);assert.equal(t.songTime(0),3);assert.ok(t.duration>=1.01/2&&t.duration<1.01/2+1/60);assert.throws(()=>exportTiming(4,3,1,30));
});
test('direct export drives each frame without live recording',async()=>{
  const {state,module}=await mocked();const result=await module.exportMp4(options(state));
  assert.equal(result.saved,true);assert.equal(state.frames.length,15);assert.deepEqual(state.frames[14],[14/30,1/30]);assert.equal(state.draws.at(-1),3+14/30*2);assert.equal(state.finalized,true);
});
test('unsupported video fails before rendering, while large disk exports pass the old memory limit',async()=>{
  const {state,module}=await mocked();state.supported=false;
  await assert.rejects(module.exportMp4(options(state)),/cannot export H.264/);assert.equal(state.draws.length,0);
  state.supported=true;const abort=new AbortController();state.onFrame=()=>abort.abort();await assert.rejects(module.exportMp4({...options(state),end:10000,signal:abort.signal}),{name:'AbortError'});assert.ok(state.frames.length>0);assert.equal(state.destination,true);
});
test('cancellation closes output and never finalizes a partial video',async()=>{
  const {state,module}=await mocked(),abort=new AbortController();state.onFrame=()=>abort.abort();
  await assert.rejects(module.exportMp4({...options(state),signal:abort.signal}),{name:'AbortError'});assert.equal(state.cancelled,true);assert.equal(state.aborted,true);assert.equal(state.finalized,undefined);
});
test('offline scheduling preserves held notes, mute/solo, speed, and later batches',async()=>{
  const {state,module}=await mocked();
  globalThis.OfflineAudioContext=class{
    constructor(channels,length,rate){this.length=length;this.sampleRate=rate;this.state='suspended';}
    suspend(time){this.pendingTime=time;return new Promise(r=>this.pending=r);}
    startRendering(){const result=new Promise(r=>this.done=r);this.resume();return result;}
    async resume(){setImmediate(()=>{if(this.pending){const resolve=this.pending;this.pending=null;this.currentTime=this.pendingTime;this.state='suspended';resolve();}else{this.state='closed';this.done({length:this.length,numberOfChannels:2,getChannelData:()=>new Float32Array(this.length)});}});}
  };
  const tracks=new Map([[1,{id:1,solo:true,mute:false}],[2,{id:2,solo:false,mute:false}],[3,{id:3,solo:true,mute:true}]]);
  const song={notes:[{start:1,end:3,pitch:60,trackId:1},{start:2,end:4,pitch:61,trackId:2},{start:2,end:4,pitch:62,trackId:3},{start:5,end:8,pitch:64,trackId:1}]};
  await module.renderAudio({song,tracks,settings:{space:.3,transpose:0,brightness:.5},volume:.6,speed:2,start:2,end:8,duration:3,signal:new AbortController().signal,onProgress(){}});
  assert.deepEqual(state.notes,[{pitch:60,track:1,t:0,d:.5},{pitch:64,track:1,t:1.5,d:1.5}]);
  delete globalThis.OfflineAudioContext;
});

test('audio sections include original held-note onsets and align on the sample grid',()=>{
  const song={notes:[{start:1,end:10},{start:12,end:14}]};
  const window=audioWindow(song,0,5,5,1);
  assert.equal(window.windowStart,1);assert.equal(window.skipFrames,4*48000);assert.equal(window.lengthFrames,5*48000);
  const next=audioWindow(song,0,10,5,1);
  assert.equal(next.windowStart+next.skipFrames/48000,10);
  const fast=audioWindow(song,2,5,5,2);assert.equal(fast.windowStart+fast.skipFrames/48000*2,12);
});

test('offline export uses the selected recording alone or blends it with the MIDI synth',async()=>{
  globalThis.OfflineAudioContext=class{constructor(ch,length,rate){this.length=length;this.sampleRate=rate;}async startRendering(){return {length:this.length,numberOfChannels:2,getChannelData:()=>new Float32Array(this.length)};}};
  const common={song:{notes:[{start:0,end:.1,pitch:60,trackId:1}]},tracks:new Map([[1,{id:1,solo:false,mute:false}]]),settings:{space:0,transpose:0,brightness:.5},volume:.65,speed:1,start:0,end:.1,duration:.1,signal:new AbortController().signal,onProgress(){}};
  for(const mode of ['file','blend']){
    const {state,module}=await mocked(),external={buffer:{duration:20},offset:-.25,rate:1.01,gain:.8,mode};
    await module.renderAudio({...common,external});
    assert.equal(state.externalArgs[2],external);assert.equal(state.externalArgs[3],0);assert.equal(state.externalArgs[4],.1);assert.equal(state.notes.length,mode==='file'?0:1);
  }
  delete globalThis.OfflineAudioContext;
});

test('transparent export uses VP9 alpha and WebM disk output; MP4 remains opaque',async()=>{
 for(const transparent of [false,true]){
  const {state,module}=await mocked();await module.exportMp4({...options(state),transparent});
  assert.equal(state.codec,transparent?'vp9':'avc');assert.equal(state.videoConfig.alpha,transparent?'keep':'discard');
  assert.equal(state.format,transparent?'WebMOutputFormat':'Mp4OutputFormat');
  assert.equal(state.destinationOptions.extension,transparent?'webm':'mp4');
  assert.equal(state.destinationOptions.mimeType,transparent?'video/webm':'video/mp4');
 }
});
test('transparent export rejects unavailable Opus before opening destination',async()=>{
 const {state,module}=await mocked();state.audioSupported=false;globalThis.OfflineAudioContext=class{};
 try{await assert.rejects(module.exportMp4({...options(state),transparent:true,includeAudio:true}),/Opus/);assert.equal(state.destination,undefined);}finally{delete globalThis.OfflineAudioContext;}
});
