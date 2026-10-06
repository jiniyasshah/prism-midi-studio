import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {importMidiFiles,mergeMidiSources,midiFileLabel} from '../dist/midi-import.js';

const vlq=n=>{const bytes=[n&127];while(n>>=7)bytes.unshift((n&127)|128);return bytes;};
function midi({ppq=480,tempo=500000,lead=0,pitch=60,program=0,channel=0,change=false}={}){
 const events=[0,255,81,3,tempo>>16&255,tempo>>8&255,tempo&255,0,192+channel,program];
 if(change)events.push(...vlq(ppq),255,81,3,15,66,64); // 1,000,000 us per quarter
 events.push(...vlq(lead),144+channel,pitch,100,...vlq(ppq),128+channel,pitch,0,0,255,47,0);
 const n=events.length;return Uint8Array.from([77,84,104,100,0,0,0,6,0,0,0,1,ppq>>8,ppq&255,77,84,114,107,n>>>24,n>>>16&255,n>>>8&255,n&255,...events]);
}
const file=(name,bytes=midi())=>({name,size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});

test('multiple files share the timeline but retain isolated tracks, channels, and programs',async()=>{
 const result=await importMidiFiles([file('Song (Strings).mid',midi({lead:960,program:48})),file('Song (Bass).mid',midi({program:32,pitch:36}))]);
 assert.equal(result.title,'Song');assert.equal(result.song.notes.length,2);assert.equal(result.song.tracks.length,2);
 assert.equal(new Set(result.song.tracks.map(t=>t.id)).size,2);
 assert.deepEqual(result.song.notes.map(n=>[n.start,n.end,n.program]),[[0,.5,32],[1,1.5,48]]);
 assert.equal(result.song.duration,2.5);assert.equal(result.song.min,36);assert.equal(result.song.max,60);
 assert.equal(result.song.tempoMismatch,false);
 assert.ok(result.song.tracks.some(t=>t.name==='Strings'));
});
test('different PPQ and tempo changes preserve each file’s seconds, with a mismatch notice',async()=>{
 const result=await importMidiFiles([file('A.mid',midi({ppq:960,lead:960})),file('B.midi',midi({change:true,lead:480}))]);
 assert.deepEqual(result.song.notes.map(n=>[n.start,n.end]),[[.5,1],[1.5,2.5]]);
 assert.equal(result.song.tempoMismatch,true);assert.equal(result.song.tempoSource,'A.mid');
 const matching=await importMidiFiles([file('A.mid',midi()),file('B.mid',midi({ppq:960}))]);assert.equal(matching.song.tempoMismatch,false);
});
test('reversed selection and later additions keep track identity stable for saved scenes',async()=>{
 const a=file('Song (Bass)(1).mid'),b=file('Song (Strings).mid',midi({program:48}));
 const first=await importMidiFiles([a]),both=await importMidiFiles([a,b]),reverse=await importMidiFiles([b,a]),added=await importMidiFiles([b],first.sources);
 assert.deepEqual(reverse.song,both.song);assert.deepEqual(added.song,both.song);
 assert.equal(first.song.tracks[0].id,both.song.tracks[0].id);
 assert.equal(first.song.tracks[0].name,both.song.tracks[0].name);
 assert.equal(midiFileLabel('Song (Backing Vocals)(1).mid'),'Backing Vocals');
});
test('identical reimports are skipped without suppressing separately named instruments',async()=>{
 const a=file('A.mid'),b=file('B.mid');const first=await importMidiFiles([a]);
 const result=await importMidiFiles([a,b,b],first.sources);
 assert.equal(result.skipped,2);assert.equal(result.sources.length,2);assert.equal(first.sources.length,1);
 assert.equal((await importMidiFiles([file('A.mid',midi({pitch:67}))],first.sources)).sources.length,2,'changed content is distinct');
});
test('a bad file rejects the batch without mutating the current project',async()=>{
 const first=await importMidiFiles([file('A.mid')]),snapshot=JSON.stringify(first);
 await assert.rejects(importMidiFiles([file('B.mid'),file('Broken.mid',new Uint8Array([1,2]))],first.sources),/Broken.mid:/);
 assert.equal(JSON.stringify(first),snapshot);
 await assert.rejects(importMidiFiles([file('audio.mp3')]),/only .mid or .midi/);
});
test('batch limits reject oversized input before reading, and limit combined note counts',async()=>{
 await assert.rejects(importMidiFiles([]),/one or more/);
 await assert.rejects(importMidiFiles(Array.from({length:65},(_,i)=>file(i+'.mid'))),/64/);
 const large={name:'large.mid',size:51*1024*1024,arrayBuffer:()=>assert.fail('must not read')};await assert.rejects(importMidiFiles([large]),/50 MB/);
 const batch=Array.from({length:3},(_,i)=>({...large,name:i+'.mid',size:40*1024*1024}));await assert.rejects(importMidiFiles(batch),/100 MB/);
 const one=await importMidiFiles([file('A.mid')]);const huge={...one.sources[0],song:{...one.sources[0].song,notes:new Array(300001)}};assert.throws(()=>mergeMidiSources([huge]),/300,000/);
});

test('provided instrument files preserve every note and entry offset', {skip:!process.env.PRISM_MIDI_FIXTURES},async()=>{
 const dir=process.env.PRISM_MIDI_FIXTURES,names=(await readdir(dir)).filter(n=>/\.(mid|midi)$/i.test(n));
 const files=await Promise.all(names.map(async name=>file(name,await readFile(dir+'/'+name))));
 const result=await importMidiFiles(files),reverse=await importMidiFiles([...files].reverse());
 assert.equal(result.sources.length,12);assert.equal(result.song.tracks.length,65);assert.equal(result.song.notes.length,7706);assert.equal(result.song.tempoMismatch,false);
 assert.equal(new Set(result.song.tracks.map(t=>t.id)).size,65);assert.deepEqual(reverse.song,result.song);
 const mapped=new Map(result.song.tracks.map(t=>[t.id,t]));
 for(const source of result.sources){
  const notes=result.song.notes.filter(n=>mapped.get(n.trackId).sourceId===source.id);
  assert.deepEqual(notes.map(({trackId,...n})=>n),source.song.notes.map(({trackId,...n})=>n));
 }
 assert.equal(result.song.duration,193.53268599999998);
 console.log('Attached arrangement:',result.sources.length,'files,',result.song.tracks.length,'tracks,',result.song.notes.length,'notes; original timing preserved.');
});
