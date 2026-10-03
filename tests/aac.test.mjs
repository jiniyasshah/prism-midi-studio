import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureAudioEncoder} from '../dist/export.js';
import {createExportDestination} from '../dist/export-storage.js';
import {Output,Mp4OutputFormat,BufferTarget,AudioSampleSource,AudioSample,Quality,Input,BufferSource,MP4,EncodedPacketSink} from '../dist/vendor/mediabunny.mjs';

test('software fallback encodes real stereo AAC packets into a readable MP4 without native AudioEncoder',async()=>{
  assert.equal(globalThis.AudioEncoder,undefined);
  await ensureAudioEncoder(()=>{});
  const writes=[];let committed=false,aborted=false;
  const fileHandle={createWritable:async()=>({write:async chunk=>writes.push({position:chunk.position,data:chunk.data.slice()}),close:async()=>{committed=true;},abort:async()=>{aborted=true;}})};
  const destination=await createExportDestination({fileHandle,estimatedBytes:2*1024**3});
  const output=new Output({format:new Mp4OutputFormat({fastStart:false}),target:destination.target});
  const source=new AudioSampleSource({codec:'aac',quality:new Quality({bitrate:320000})});output.addAudioTrack(source);await output.start();
  const pcm=new Float32Array(48000*2);for(let i=0;i<48000;i++){pcm[i]=Math.sin(2*Math.PI*440*i/48000)*.2;pcm[48000+i]=Math.sin(2*Math.PI*660*i/48000)*.2;}
  const sample=new AudioSample({data:pcm,format:'f32-planar',numberOfChannels:2,sampleRate:48000,timestamp:0});
  try{await source.add(sample);}finally{sample.close();}
  source.close();await output.finalize();
  assert.equal(committed,false);const result=await destination.finish();assert.equal(committed,true);assert.equal(aborted,false);assert.equal(result.saved,true);
  const bytes=new Uint8Array(Math.max(...writes.map(w=>w.position+w.data.length)));
  for(const w of writes)bytes.set(w.data,w.position);
  const target={buffer:bytes.buffer};assert.ok(target.buffer.byteLength>1000);
  const input=new Input({source:new BufferSource(target.buffer),formats:[MP4]});
  const track=await input.getPrimaryAudioTrack();assert.equal(track.codec,'aac');assert.equal(await track.getNumberOfChannels(),2);assert.equal(await track.getSampleRate(),48000);
  let count=0;for await(const packet of new EncodedPacketSink(track).packets()){assert.ok(packet.data.byteLength);count++;}
  assert.ok(count>=46);assert.ok(Math.abs(await input.computeDuration()-1)<.05);input.dispose();
});

test('cancelled streamed output aborts its file transaction instead of saving a partial MP4',async()=>{
  let committed=false,aborted=false;
  const fileHandle={createWritable:async()=>({write:async()=>{},close:async()=>{committed=true;},abort:async()=>{aborted=true;}})};
  const destination=await createExportDestination({fileHandle,estimatedBytes:2*1024**3});
  const output=new Output({format:new Mp4OutputFormat({fastStart:false}),target:destination.target});
  const audio=new AudioSampleSource({codec:'aac',quality:new Quality({bitrate:320000})});output.addAudioTrack(audio);
  await output.start();await output.cancel();await destination.abort();
  assert.equal(committed,false);assert.equal(aborted,true);
});
