import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {validateAudioFile} from '../dist/transcription-core.js';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function syncTranscriptionControls('),source.indexOf('async function openAudio('));
function setup({fail=false}={}){
 const nodes=new Map(),state={imports:[],saved:[]};
 const $=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},value:'',listeners:{},addEventListener(event,cb){this.listeners[event]=cb;},focus(){},scrollIntoView(){},click(){return this.listeners.click?.();}});return nodes.get(id);};
 const context={$,recording:false,assetBusy:false,transcriptionFile:null,transcriptionResult:null,transcriptionAbort:null,validateAudioFile,AbortController,File,Blob,performance,Number,fmt:n=>String(n),pause(){},toast(message){state.toast=message;},showPanel(){},updateFrameChoice(){},mediaLoading(on){context.assetBusy=on;},saveBlob(blob,name){state.saved.push({blob,name});},async openFiles(files,append){state.imports.push({files,append});},async transcribeAudio(file,options){state.options=options;options.onProgress({phase:'Working',fraction:.5});if(fail)throw Error('No notes detected.');return {bytes:new Uint8Array([1,2]),name:'piano-transcribed.mid',noteCount:5,duration:10};}};
 vm.runInNewContext(code,context);$('transcription-onset').value='.5';$('transcription-frame').value='.3';$('transcription-min').value='.07';return {context,state,$};
}
test('transcription UI reveals usable download/add/replace actions and passes detection settings',async()=>{
 const {context,state,$}=setup();context.chooseTranscriptionFile(new File(['wave'],'piano.wav',{type:'audio/wav'}));assert.equal($('transcription-start').disabled,false);assert.equal($('transcription-result').hidden,true);
 await context.startTranscription();assert.equal(context.assetBusy,false);assert.equal(context.transcriptionAbort,null);assert.equal($('transcription-result').hidden,false);assert.match($('transcription-status').textContent,/5 notes extracted/);assert.equal(state.options.minDuration,.07);
 $('transcription-download').click();assert.equal(state.saved[0].name,'piano-transcribed.mid');await $('transcription-add').click();await $('transcription-replace').click();assert.deepEqual(state.imports.map(i=>i.append),[true,false]);assert.equal(state.imports[0].files[0].name,'piano-transcribed.mid');
});
test('empty detection restores controls without importing or offering stale MIDI',async()=>{
 const {context,state,$}=setup({fail:true});context.chooseTranscriptionFile(new File(['wave'],'silent.wav',{type:'audio/wav'}));await context.startTranscription();assert.equal(context.assetBusy,false);assert.equal($('transcription-start').disabled,false);assert.equal($('transcription-result').hidden,true);assert.equal(state.imports.length,0);assert.equal($('transcription-status').dataset.error,'true');
});
