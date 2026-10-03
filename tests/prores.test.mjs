import test from 'node:test';
import assert from 'node:assert/strict';
import {exportMp4,ensureProResEncoder} from '../dist/export.js';
import {Input,BufferSource,ALL_FORMATS,EncodedPacketSink,Output,MovOutputFormat,BufferTarget,VideoSampleSource,VideoSample,Quality,AudioSample,AudioSampleSource} from '../dist/vendor/mediabunny.mjs';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('actual software ProRes export produces MOV with alpha without native WebCodecs',async()=>{
 const width=64,height=64,rgba=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;rgba.set([60+x*2,80+y*2,190,x<8?0:x>55?255:Math.round((x-8)/48*255)],i);}
 const canvas={getContext:()=>({getImageData:()=>({data:rgba})})};
 const result=await exportMp4({canvas,draw:()=>{},width,height,fps:30,bitrate:25000000,transparent:true,transparentFormat:'prores',includeAudio:false,start:0,end:.1,speed:1,signal:new AbortController().signal,onProgress:()=>{}});
 assert.equal(result.blob.type,'video/quicktime');const bytes=new Uint8Array(await result.blob.arrayBuffer());
 const input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS}),track=await input.getPrimaryVideoTrack();
 assert.equal(track.codec,'prores');assert.equal((await track.getDecoderConfig()).codec,'ap4h');let frames=0;for await(const p of new EncodedPacketSink(track).packets()){assert.ok(p.data.length>100);frames++;}assert.equal(frames,3);input.dispose();
 if(spawnSync('ffmpeg',['-version']).status===0){
  const dir=await mkdtemp(join(tmpdir(),'prism-prores-'));try{
   await writeFile(join(dir,'sample.mov'),bytes);const run=spawnSync('ffmpeg',['-v','error','-i',join(dir,'sample.mov'),'-frames:v','1','-pix_fmt','rgba','-f','rawvideo',join(dir,'decoded.rgba')]);assert.equal(run.status,0,run.stderr.toString());
   const decoded=await readFile(join(dir,'decoded.rgba'));let alphaError=0,colorError=0,n=0;
   for(let i=0;i<rgba.length;i+=4){alphaError=Math.max(alphaError,Math.abs(decoded[i+3]-rgba[i+3]));if(rgba[i+3]>20)for(let c=0;c<3;c++){colorError+=Math.abs(decoded[i+c]-rgba[i+c]);n++;}}
   assert.ok(alphaError<=1,`alpha error ${alphaError}`);assert.ok(colorError/n<5,`RGB mean error ${colorError/n}`);console.log('ProRes decoded RGBA:',{alphaMaxError:alphaError,rgbMeanError:colorError/n});
  }finally{await rm(dir,{recursive:true,force:true});}
 }
});
test('ProRes MOV muxes stereo PCM alongside video',async()=>{
 await ensureProResEncoder();const target=new BufferTarget(),out=new Output({format:new MovOutputFormat({fastStart:false}),target});
 const video=new VideoSampleSource({codec:'prores',fullCodecString:'ap4h',alpha:'keep',quality:new Quality('high')}),audio=new AudioSampleSource({codec:'pcm-s24'});out.addVideoTrack(video,{frameRate:30});out.addAudioTrack(audio);await out.start();
 const pcm=new AudioSample({format:'f32-planar',numberOfChannels:2,sampleRate:48000,timestamp:0,data:new Float32Array(4800*2)});await audio.add(pcm);pcm.close();
 for(let i=0;i<3;i++){const frame=new VideoSample(new Uint8Array(64*64*4),{format:'RGBA',codedWidth:64,codedHeight:64,timestamp:i/30,duration:1/30});await video.add(frame);frame.close();}video.close();audio.close();await out.finalize();
 const input=new Input({source:new BufferSource(target.buffer),formats:ALL_FORMATS});assert.equal((await input.getPrimaryAudioTrack()).codec,'pcm-s24');assert.equal(await (await input.getPrimaryAudioTrack()).getNumberOfChannels(),2);assert.ok(Math.abs(await input.computeDuration()-.1)<.001);input.dispose();
});
