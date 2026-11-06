import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {importMidiFiles} from '../dist/midi-import.js';
import {classifyMediaFiles} from '../dist/media-import.js';
import {demoSong} from '../dist/midi.js';
const source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
// Exercise the production import workflow and its event handlers with a minimal
// DOM fixture; this is not a browser rendering test.
function block(name,next){const start=source.indexOf(`function ${name}(`);const end=source.indexOf(`\n${next}`,start);assert.ok(start>=0&&end>start);return (source.slice(start-6,start)==='async '?'async ':'')+source.slice(start,end);}
class Element {
 constructor(){this.style={};this.children=[];this.listeners={};this.dataset={};this.value='';this.classList={toggle(){}};}
 append(...children){this.children.push(...children)}replaceChildren(){this.children=[]}setAttribute(k,v){this[k]=v}
 addEventListener(type,handler){this.listeners[type]=handler}click(){return this.listeners.click?.({target:this})}
}
function setup(){
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const document=new Element();document.body=new Element();document.createElement=()=>new Element();
 const ctx=vm.createContext({console,importMidiFiles,classifyMediaFiles,demoSong,File,AbortController,performance,transcriptionFile:null,transcriptionResult:null,transcriptionAbort:null,document,$,$$:()=>[],palettes:{aurora:['#111111','#222222','#333333','#444444','#555555','#666666']},GM_NAMES:[],settings:{preset:'aurora'},clamp:(x,a,b)=>Math.max(a,Math.min(x,b)),fmt:x=>String(x),song:demoSong(),tracks:new Map(),title:'First Light',isDemo:true,midiSources:[],recording:false,assetBusy:false,position:0,loop:false,loopA:0,loopB:41,nextNote:0,dragDepth:0,pendingSceneTracks:null,pendingScenePlayback:null,pause(){},updateTimeline(){},updateCompactEstimate(){},updateFrameChoice(){},syncTranscriptionControls(){},drawAudioWaveform(){},reschedule(){},showPanel(){},toast(){},now(){return ctx.position},captureScene(){return {tracks:[...ctx.tracks.values()].map(({id,name,color,visible,mute,solo,volume,pan,instrument})=>({id,name,color,visible,mute,solo,volume,pan,instrument})),playback:{loop:ctx.loop,loopStart:ctx.loopA,loopEnd:ctx.loopB}}},restorePlayback(p){ctx.loop=p.loop;ctx.loopA=p.loopStart;ctx.loopB=p.loopEnd},external:{name:'',mode:'synth',offset:0,rate:1,gain:1},backgroundName:'',speed:1,captureFrameSettings:()=>({})});
 vm.runInContext([
  block('loadSong','function buildTracks'),block('buildTracks','function lowerBound'),
  block('updateMidiStatus','async function openFiles'),block('openFiles','function validLoop'),
  block('startTranscription','async function importTranscription'),
  block('captureScene','function restoreTrackSettings'),block('restoreTrackSettings','function restorePlayback'),block('mediaLoading','function syncTranscriptionControls'),
  source.split('\n').find(line=>line.startsWith("$('open-file').addEventListener")),
  source.split('\n').find(line=>line.startsWith("document.addEventListener('dragenter'"))
 ].join('\n'),ctx);return {ctx,$,document};
}
// A format-0 file with a note starting one quarter after the shared origin.
const bytes=Uint8Array.from([77,84,104,100,0,0,0,6,0,0,0,1,1,224,77,84,114,107,0,0,0,14,131,96,144,60,100,131,96,128,60,0,0,255,47,0]);
const file=name=>({name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(0)});

test('file picker loads all selected files, groups tracks, and clears selector for re-selection',async()=>{
 const {ctx,$}=setup();await $('file-input').listeners.change({target:{files:[file('Song (Bass).mid'),file('Song (Strings).mid')]}});
 assert.equal(ctx.midiSources.length,2);assert.equal(ctx.tracks.size,2);assert.equal(ctx.song.notes[0].start,.5);assert.equal(ctx.isDemo,false);
 assert.equal($('track-list').children.length,2);assert.match($('track-list').children[0].children[0].textContent,/Bass/);
 assert.deepEqual(Array.from(ctx.captureScene().media.midiFiles),['Song (Bass).mid','Song (Strings).mid']);
 assert.equal($('file-input').value,'');assert.equal(ctx.assetBusy,false);assert.equal($('media-choose').disabled,false);
});
test('add picker and dropping files retain existing mix and playhead without track collisions',async()=>{
 const {ctx,$,document}=setup();await ctx.openFiles([file('Song (Bass).mid')]);
 const original=[...ctx.tracks.values()][0];original.color='#abcdef';original.mute=true;original.volume=.37;ctx.position=.4;
 await $('file-input').listeners.change({target:{files:[file('Song (Strings).mid')]}});
 assert.equal(ctx.tracks.size,2);assert.equal(ctx.tracks.get(original.id).color,'#abcdef');assert.equal(ctx.tracks.get(original.id).mute,true);assert.equal(ctx.tracks.get(original.id).volume,.37);assert.equal(ctx.position,.4);
 document.listeners.drop({preventDefault(){},dataTransfer:{files:[file('Song (Brass).mid'),file('Song (Vocals).mid')]}});
 // The DOM event is synchronous; wait for its asynchronous batch to finish.
 while(ctx.assetBusy)await new Promise(r=>setTimeout(r,1));
 assert.equal(ctx.midiSources.length,4);assert.equal(ctx.tracks.size,4);assert.equal(ctx.tracks.get(original.id).mute,true);
 await ctx.openFiles([file('Song (Bass).mid')],true);assert.equal(ctx.tracks.size,4);assert.match($('midi-import-status').textContent,/already loaded/);
 await ctx.openFiles([file('New.mid')]);assert.equal(ctx.midiSources.length,1);assert.equal(ctx.tracks.size,1);
});
test('bad batches leave the arrangement intact and active exports block imports',async()=>{
 const {ctx,$}=setup();await ctx.openFiles([file('A.mid')]);const song=ctx.song;
 await ctx.openFiles([file('B.mid'),{name:'Broken.mid',size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer}],true);
 assert.equal(ctx.song,song);assert.equal(ctx.midiSources.length,1);assert.match($('midi-import-status').textContent,/Broken.mid/);assert.equal(ctx.assetBusy,false);
 ctx.recording=true;await ctx.openFiles([file('C.mid')]);assert.equal(ctx.song,song);
});

test('legacy single-file scene mixes still restore after namespaced import',async()=>{
 const {ctx}=setup();await ctx.openFiles([file('Piano.mid')]);const track=[...ctx.tracks.values()][0];
 ctx.restoreTrackSettings([{id:track.originalId,name:track.originalName,color:'#abcdef',volume:.42,mute:true}]);
 assert.equal(track.color,'#abcdef');assert.equal(track.volume,.42);assert.equal(track.mute,true);
});


test('successful transcription automatically imports real MIDI while media is busy, preserving the existing mix',async()=>{
 const {ctx,$}=setup();await ctx.openFiles([file('Bass.mid')]);const original=[...ctx.tracks.values()][0];original.volume=.32;
 ctx.transcriptionFile=file('audio.wav');ctx.transcribeAudio=async()=>({bytes,name:'Extracted.mid',noteCount:1,duration:1});
 $('transcription-onset').value='.5';$('transcription-frame').value='.3';$('transcription-min').value='.07';$('media-mode').value='append';
 await ctx.startTranscription();assert.equal(ctx.midiSources.length,2);assert.equal(ctx.tracks.get(original.id).volume,.32);assert.equal(ctx.assetBusy,false);assert.match($('transcription-status').textContent,/Notes loaded into the scene/);
 $('media-mode').value='replace';await ctx.startTranscription();assert.equal(ctx.midiSources.length,1);assert.equal(ctx.midiSources[0].name,'Extracted.mid');
});
test('cancelling between transcription and MIDI import never changes the arrangement',async()=>{
 const {ctx,$}=setup();await ctx.openFiles([file('Bass.mid')]);const song=ctx.song;ctx.transcriptionFile=file('audio.wav');ctx.transcribeAudio=async()=>{ctx.transcriptionAbort.abort();return {bytes,name:'Extracted.mid',noteCount:1,duration:1};};
 $('transcription-onset').value='.5';$('transcription-frame').value='.3';$('transcription-min').value='.07';await ctx.startTranscription();assert.equal(ctx.song,song);assert.equal(ctx.assetBusy,false);assert.match($('transcription-status').textContent,/cancelled/);
});
