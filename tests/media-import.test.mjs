import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyMediaFiles} from '../dist/media-import.js';
const file=(name,type='',size=12)=>({name,type,size});
test('single media entry accepts multiple MIDI parts and one audio recording',()=>{
 const a=file('Piano.mid'),b=file('Bass.MIDI'),audio=file('Song.wav','audio/wav');assert.deepEqual(classifyMediaFiles([a,b,audio]),{midi:[a,b],audio});assert.deepEqual(classifyMediaFiles([audio]),{midi:[],audio});
});
test('invalid batches reject before any import, including oversized audio or multiple recordings',()=>{
 for(const batch of [[],[file('a.wav'),file('b.mp3')],[file('a.mid'),file('image.png','image/png')],[file('big.wav','audio/wav',150*1024**2+1)]])assert.throws(()=>classifyMediaFiles(batch));
});
