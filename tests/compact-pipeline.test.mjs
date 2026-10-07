import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compactBudget,compactInstructions,afterEffectsImport} from '../dist/compact-export.js';
import {writeStoredZip} from '../dist/zip-store.js';

const source=await readFile(new URL('../dist/export.js',import.meta.url),'utf8');
function setup({supported=true,fail=false,onFrame=()=>{}}={}){
 const state={destinations:[],outputs:[],draws:[],surfacesClosed:false};
 class Quality {constructor(value){Object.assign(this,value);}}
 class Output {
  constructor({target}){this.target=target;state.outputs.push(this);}
  addVideoTrack(video){this.video=video;}
  addAudioTrack(audio){this.audio=audio;}
  async start(){}
  async finalize(){this.finalized=true;await this.target.write(new TextEncoder().encode('test MP4'),0);}
  async cancel(){this.cancelled=true;}
 }
 class CanvasSource {
  constructor(canvas,config){this.canvas=canvas;this.config=config;this.frames=[];}
  async add(t,d){this.frames.push([t,d]);onFrame();if(fail&&this.canvas==='matte')throw Error('encoder failed');}
  close(){this.closed=true;}
 }
 class AudioBufferSource {constructor(){this.buffers=[];}async add(b){this.buffers.push(b);}close(){this.closed=true;}}
 async function createExportDestination(options){
  const writes=[];const destination={options,kind:'temporary',write:async(data,position)=>writes.push({data,position}),finish:async()=>{destination.finished=true;return {blob:new Blob(writes.map(w=>w.data)),cleanup:async()=>{destination.cleaned=true;}};},abort:async()=>{destination.aborted=true;}};
  destination.target=destination;state.destinations.push(destination);return destination;
 }
 const deps={Quality,Output,CanvasSource,AudioBufferSource,Mp4OutputFormat:class{},canEncodeVideo:async()=>supported,canEncodeAudio:async()=>true,createExportDestination,compactBudget,compactInstructions,afterEffectsImport,writeStoredZip,createMatteSurfaces:()=>({color:'color',matte:'matte',draw:()=>{},close:()=>{state.surfacesClosed=true;}})};
 // Replace only audio synthesis: codec orchestration and packaging use production code.
 let code=source.replace(/^import .*;\n/gm,'').replace('export async function renderAudio(', 'async function unusedRenderAudio(').replace(/^export /gm,'');
 const renderAudio=async({duration})=>({getChannelData:()=>new Float32Array(Math.ceil(duration*48000))});
 const exportMp4=new Function(...Object.keys(deps),'renderAudio',code+'\nreturn exportMp4;')(...Object.values(deps),renderAudio);
 const options={canvas:{},draw:t=>state.draws.push(t),width:1920,height:1080,fps:30,start:3,end:4,speed:2,includeAudio:false,transparent:true,transparentFormat:'compact',compactQuality:'balanced',signal:new AbortController().signal,onProgress(){}};
 return {state,options,exportMp4};
}
test('compact route renders once per timestamp, encodes synchronized pairs and packages bounded outputs',async()=>{
 const {state,options,exportMp4}=setup();const result=await exportMp4(options);
 assert.equal(result.stats.frames,15);assert.equal(state.draws.length,15);assert.equal(state.draws.at(-1),3+14/30*2);
 const [color,matte]=state.outputs;assert.deepEqual(color.video.frames,matte.video.frames);assert.deepEqual(color.video.frames.at(-1),[14/30,1/30]);
 assert.equal(color.video.config.quality.bitrate,8000000);assert.equal(matte.video.config.quality.bitrate,2000000);
 assert.equal(result.stats.bytes,result.blob.size);assert.equal(state.destinations[0].options.extension,'zip');
 assert.ok(state.destinations.every(d=>Number.isFinite(d.options.maxBytes)));assert.ok(state.destinations.slice(1).every(d=>d.cleaned));assert.equal(state.surfacesClosed,true);
});
test('compact export routes optional audio into color only',async()=>{
 globalThis.OfflineAudioContext=class{};globalThis.AudioBuffer=class{copyToChannel(){}};
 try{const {state,options,exportMp4}=setup();await exportMp4({...options,includeAudio:true,song:{notes:[]}});assert.equal(state.outputs[0].audio.buffers.length,1);assert.equal(state.outputs[1].audio,undefined);}finally{delete globalThis.OfflineAudioContext;delete globalThis.AudioBuffer;}
});
test('encoder failure and cancellation abort every output and destination',async()=>{
 for(const fail of [true,false]){const abort=new AbortController();const {state,options,exportMp4}=setup({fail,onFrame:()=>{if(!fail)abort.abort();}});
  await assert.rejects(exportMp4({...options,signal:abort.signal}),fail?/encoder failed/:{name:'AbortError'});
  assert.ok(state.outputs.every(o=>o.cancelled&&!o.finalized));assert.ok(state.destinations.every(d=>d.aborted&&!d.finished));assert.equal(state.surfacesClosed,true);
 }
});
test('unsupported H.264 creates no destinations',async()=>{
 const {state,options,exportMp4}=setup({supported:false});await assert.rejects(exportMp4(options),/H.264 export is unavailable/);assert.equal(state.destinations.length,0);assert.equal(state.draws.length,0);
});
