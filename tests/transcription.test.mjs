import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as tf from '@tensorflow/tfjs';
import {loadTranscriber} from '../scripts/transcription-engine.js';
import {AUDIO_MAX_BYTES,validateAudioFile,audioSections,monoSection,appendSectionNotes,notesToMidi} from '../dist/transcription-core.js';
import {transcribeAudio} from '../dist/audio-transcription.js';
import {parseMidi} from '../dist/midi.js';
import {importMidiFiles} from '../dist/midi-import.js';

test('150 MiB boundary is accepted; empty, oversized and non-audio files reject before reading',async()=>{
 validateAudioFile({size:AUDIO_MAX_BYTES,name:'stem.wav',type:'audio/wav'});
 for(const file of [{size:0,name:'empty.wav'},{size:AUDIO_MAX_BYTES+1,name:'large.wav'},{size:8,name:'image.png',type:'image/png'}]){
  await assert.rejects(transcribeAudio({...file,arrayBuffer:()=>assert.fail('must reject before reading')}));
 }
});
test('overlapping sections downmix stereo and stitch held notes without duplicate seam notes',()=>{
 const sections=audioSections(61);assert.equal(sections.length,3);assert.deepEqual(sections[1],{from:30,to:60,start:28,end:61});
 const buffer={sampleRate:2,length:8,numberOfChannels:2,getChannelData:c=>Float32Array.from(c?[0,0,0,0,0,0,0,0]:[1,1,1,1,1,1,1,1])};assert.deepEqual([...monoSection(buffer,{start:1,end:3})],[.5,.5,.5,.5]);
 const notes=[];appendSectionNotes(notes,[{startTimeSeconds:29,durationSeconds:3,pitchMidi:60,amplitude:.8}],sections[0],61);
 appendSectionNotes(notes,[{startTimeSeconds:1,durationSeconds:3,pitchMidi:60,amplitude:.8},{startTimeSeconds:4,durationSeconds:1,pitchMidi:60,amplitude:.6}],sections[1],61);
 assert.deepEqual(notes.map(n=>[n.start,n.end,n.pitch]),[[29,32,60],[32,33,60]]);
});
test('downloadable MIDI preserves leading silence, duration and polyphony; arrangement import supports repeat detection',async()=>{
 const bytes=notesToMidi([{start:1.234,end:2.345,pitch:60,velocity:.8},{start:1.234,end:1.678,pitch:64,velocity:.5},{start:2.345,end:3,pitch:60,velocity:.7}],8,'Piano');
 const midi=parseMidi(bytes.buffer);assert.equal(midi.notes.length,3);assert.equal(midi.notes[0].start,1.234);assert.equal(midi.notes[0].end,2.345);assert.ok(midi.duration>=8);assert.equal(midi.notes[1].pitch,64);
 const file=new File([bytes],'piano-transcribed.mid');const first=await importMidiFiles([file]);const again=await importMidiFiles([file],first.sources);assert.equal(again.skipped,1);assert.equal(again.song.notes.length,3);
});
function fakeWorker({fail=false,hang=false}={}){
 const state={terminated:0,messages:[]};
 const worker={terminate(){state.terminated++;},postMessage(data){state.messages.push(data);queueMicrotask(()=>{if(fail){worker.onmessage({data:{type:'error',message:'model load failed'}});return;}if(data.type==='init')worker.onmessage({data:{type:'ready'}});else if(!hang)worker.onmessage({data:{type:'result',notes:[{startTimeSeconds:1,durationSeconds:.5,pitchMidi:69,amplitude:.9}]}});});}};return {worker,state};
}
const file=new File([new Uint8Array(8)],'test.wav',{type:'audio/wav'});
const decoded={sampleRate:22050,length:44100,numberOfChannels:1,duration:2,getChannelData:()=>new Float32Array(44100)};
test('controller decodes, transfers one bounded section at a time and cleans worker after success/failure',async()=>{
 const {worker,state}=fakeWorker();const result=await transcribeAudio(file,{workerFactory:()=>worker,decode:async()=>decoded});assert.equal(result.noteCount,1);assert.equal(result.name,'test-transcribed.mid');assert.equal(state.terminated,1);assert.equal(parseMidi(result.bytes.buffer).notes[0].pitch,69);
 const failed=fakeWorker({fail:true});await assert.rejects(transcribeAudio(file,{workerFactory:()=>failed.worker,decode:async()=>decoded}),/model load failed/);assert.equal(failed.state.terminated,1);
});
test('cancel terminates active inference and rejects without returning partial MIDI',async()=>{
 const {worker,state}=fakeWorker({hang:true}),abort=new AbortController();const result=transcribeAudio(file,{signal:abort.signal,workerFactory:()=>worker,decode:async()=>decoded});
 await new Promise(resolve=>setImmediate(resolve));abort.abort();await assert.rejects(result,{name:'AbortError'});assert.ok(state.terminated>=1);
});
test('real Basic Pitch WASM detects a synthetic A4 and releases tensors between sections',async()=>{
 const root=new URL('../node_modules/@spotify/basic-pitch/model/',import.meta.url),json=JSON.parse(await readFile(new URL('model.json',root))),weights=await readFile(new URL('group1-shard1of1.bin',root));
 const artifacts={...json,weightSpecs:json.weightsManifest[0].weights,weightData:weights.buffer.slice(weights.byteOffset,weights.byteOffset+weights.byteLength)};
 const engine=await loadTranscriber({wasmPath:new URL('../node_modules/@tensorflow/tfjs-backend-wasm/dist/',import.meta.url).pathname,modelArtifacts:artifacts});
 try{const baseline=tf.memory().numTensors,samples=new Float32Array(22050*3);for(let i=11025;i<55125;i++){const t=(i-11025)/22050,envelope=Math.min(1,t*30)*Math.min(1,(2-t)*30);samples[i]=envelope*(.55*Math.sin(2*Math.PI*440*t)+.18*Math.sin(2*Math.PI*880*t));}
  const notes=await engine.transcribe(samples);assert.ok(notes.some(n=>n.pitchMidi===69&&n.durationSeconds>1),JSON.stringify(notes));assert.equal(tf.memory().numTensors,baseline);
  const silent=await engine.transcribe(new Float32Array(22050));assert.equal(silent.length,0);assert.equal(tf.memory().numTensors,baseline);
 }finally{engine.dispose();}
});
