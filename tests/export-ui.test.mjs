import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {exportReport} from '../dist/export-report.js';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function startDirectExport('),source.indexOf('async function startRecording('));
function app(){
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,hidden:false,textContent:'',click(){}});return nodes.get(id)};
 $('export-range').value='all';$('export-transparent').checked=true;$('transparent-format').value='png';$('fps').value='30';$('bitrate').value='25000000';$('volume').value='.7';
 const state={};const ctx=vm.createContext({$,exportReport,recording:false,assetBusy:false,now:()=>5,pause(){},validLoop(){},getFrameSize:()=>({width:1920,height:1080}),song:{duration:180},speed:2,loopA:0,loopB:180,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),safeName:()=> 'song',AbortController,recordUI:on=>state.recording=on,releaseExport:async()=>{},canvas:{},tracks:new Map(),external:{},settings:{},pickExportFile:async(...args)=>{state.picker=args;return null},exportMp4:async options=>{state.options=options;return {saved:true,stats:{bytes:5*1024**2,elapsedMs:3000,frames:90,duration:(options.end-options.start)/options.speed}}},toast(){},updateFrameChoice(){},drawFrame(){},updatePlay(){}});
 vm.runInContext(code,ctx);return {ctx,state,$};
}
test('PNG test export selects MOV and reports actual cost without changing full export range',async()=>{
 const {ctx,state,$}=app();await ctx.startDirectExport(true);
 assert.deepEqual(state.picker,['song-prism-test.mov',true,true]);assert.equal(state.options.transparentFormat,'png');assert.equal(state.options.start,5);assert.equal(state.options.end,11);
 assert.match($('export-result').textContent,/5.0 MB/);assert.match($('export-result').textContent,/Full range/);assert.equal(state.recording,false);
 await ctx.startDirectExport(false);assert.equal(state.options.start,0);assert.equal(state.options.end,180);assert.equal(state.picker[0],'song-prism.mov');
});
test('old local ProRes default migrates once; explicit new ProRes and WebM choices persist',()=>{
 const start=source.indexOf("try{const frame=JSON.parse(localStorage.getItem('prism-frame')");const end=source.indexOf("for(const id of ['aspect'",start);assert.ok(start>0&&end>start);
 for(const [format,revision,want] of [['prores',undefined,'png'],['prores',2,'prores'],['png',2,'png'],['webm',undefined,'webm']]){
  const {ctx,$}=app();ctx.resolveFrame=()=>{};ctx.resolveCustomResolution=()=>{};ctx.localStorage={getItem:()=>JSON.stringify({aspect:'1.7777777778',resolution:'1920',transparent:true,transparentFormat:format,transparentFormatRevision:revision})};
  vm.runInContext(source.slice(start,end),ctx);assert.equal($('transparent-format').value,want);
 }
});
