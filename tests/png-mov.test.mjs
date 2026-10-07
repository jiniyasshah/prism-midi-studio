import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PngMovWriter} from '../dist/png-mov.js';
import {exportMp4} from '../dist/export.js';
import {createExportDestination} from '../dist/export-storage.js';
import {exportReport} from '../dist/export-report.js';
const width=32,height=16,rgba=Buffer.alloc(width*height*4);
for(let i=0;i<rgba.length;i+=4){rgba[i]=i%251;rgba[i+1]=90;rgba[i+2]=180;rgba[i+3]=(i/4)%256;}
function png(pixels=rgba){
 const chunk=(name,data)=>{const type=Buffer.from(name),body=Buffer.concat([type,data]);let crc=0xffffffff;for(const b of body){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}const header=Buffer.alloc(4),tail=Buffer.alloc(4);header.writeUInt32BE(data.length);tail.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([header,body,tail]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
const bytes=png(),canvas={toBlob:callback=>callback(new Blob([bytes],{type:'image/png'}))};
const options={canvas,draw(){},width,height,fps:30,bitrate:25000000,transparent:true,transparentFormat:'png',includeAudio:false,start:2,end:2.1,speed:1,signal:new AbortController().signal,onProgress(){}};
const hasFfmpeg=spawnSync('ffmpeg',['-version']).status===0;

test('PNG MOV exports without WebCodecs and reports actual size/timing',async()=>{
 const times=[],result=await exportMp4({...options,draw:t=>times.push(t)});
 assert.equal(result.blob.type,'video/quicktime');assert.equal(result.stats.bytes,result.blob.size);assert.equal(result.stats.frames,4); // ceil(0.1 * 30) includes floating-point padding
 assert.deepEqual(times,[2,2+1/30,2+2/30,2+3/30]);assert.ok(result.stats.elapsedMs>=0);
});
test('PNG MOV decodes exact RGBA and preserves stereo audio, frame rate and duration',{skip:!hasFfmpeg},async()=>{
 const destination=await createExportDestination({raw:true,estimatedBytes:0,mimeType:'video/quicktime',extension:'mov'});
 const writer=new PngMovWriter(destination,{width,height,fps:30});await writer.start();
 const left=new Float32Array(4800).fill(.25),right=new Float32Array(4800).fill(-.5),audio={sampleRate:48000,numberOfChannels:2,length:4800,getChannelData:c=>c?right:left};
 await writer.addAudio(audio,0,3200);await writer.addFrame(bytes);await writer.addFrame(bytes);await writer.addAudio(audio,3200,1600);await writer.addFrame(bytes);await writer.finish();const result=await destination.finish();
 const dir=await mkdtemp(join(tmpdir(),'prism-png-'));try{
  const path=join(dir,'video.mov');await writeFile(path,new Uint8Array(await result.blob.arrayBuffer()));
  const probe=spawnSync('ffprobe',['-v','error','-show_streams','-of','json',path]);assert.equal(probe.status,0,probe.stderr.toString());const streams=JSON.parse(probe.stdout).streams;
  assert.equal(streams[0].codec_name,'png');assert.equal(streams[0].pix_fmt,'rgba');assert.equal(streams[0].nb_frames,'3');assert.equal(streams[0].r_frame_rate,'30/1');assert.equal(Number(streams[0].duration),.1);
  assert.equal(streams[1].codec_name,'pcm_s16le');assert.equal(streams[1].channels,2);assert.equal(Number(streams[1].duration),.1);
  const decoded=spawnSync('ffmpeg',['-v','error','-i',path,'-map','0:v:0','-frames:v','1','-pix_fmt','rgba','-f','rawvideo','pipe:1']);assert.equal(decoded.status,0,decoded.stderr.toString());assert.deepEqual(decoded.stdout,rgba);
  const pcm=spawnSync('ffmpeg',['-v','error','-i',path,'-map','0:a:0','-f','s16le','pipe:1']);assert.equal(pcm.status,0);assert.equal(pcm.stdout.length,4800*4);for(let i=0;i<4800;i++){assert.equal(pcm.stdout.readInt16LE(i*4),8192);assert.equal(pcm.stdout.readInt16LE(i*4+2),-16384);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('PNG cancellation and quota errors abort disk writes without committing',async()=>{
 for(const quota of [false,true]){let aborted=false,committed=false;const abort=new AbortController();let draws=0;
  const fileHandle={createWritable:async()=>({write:async()=>{if(quota)throw new DOMException('full','QuotaExceededError');},abort:async()=>{aborted=true;},close:async()=>{committed=true;}})};
  await assert.rejects(exportMp4({...options,fileHandle,signal:abort.signal,draw:()=>{if(++draws===2)abort.abort();}}),quota?/selected disk ran out/:{name:'AbortError'});
  assert.equal(aborted,true);assert.equal(committed,false);
 }
});
test('native encoder failures discard partial output',async()=>{
 let aborted=false;const fileHandle={createWritable:async()=>({write:async()=>{},abort:async()=>{aborted=true;},close:async()=>assert.fail('must not commit')})};
 await assert.rejects(exportMp4({...options,fileHandle,canvas:{toBlob:callback=>callback(null)}}),/PNG encoding failed/);assert.equal(aborted,true);
});
test('sample report exposes actual size and approximate full-range cost',()=>{
 const report=exportReport({bytes:300*1024**2,duration:3,elapsedMs:114000},180);
 assert.match(report,/300.0 MB/);assert.match(report,/114m 0s/);assert.match(report,/17.58 GB/);assert.match(report,/estimate/);
});


test('parallel native encodes may finish out of order but MOV frames stay ordered',async()=>{
 const writes=[],expected=[];let frame=0,inFlight=0,peak=0;
 const fileHandle={createWritable:async()=>({write:async c=>{writes.push(c.data.slice());},close:async()=>{},abort:async()=>{}})};
 const result=await exportMp4({...options,start:0,end:.2,fileHandle,draw:()=>frame++,canvas:{toBlob:callback=>{
  const pixels=Buffer.from(rgba);pixels[0]=frame;const captured=png(pixels);expected.push(captured);inFlight++;peak=Math.max(peak,inFlight);
  setTimeout(()=>{inFlight--;callback(new Blob([captured],{type:'image/png'}));},frame%2?12:1);
 }}});
 const actual=writes.filter(b=>b[0]===137&&b[1]===80).map(b=>Buffer.from(b));assert.deepEqual(actual,expected);assert.equal(result.stats.frames,6);assert.ok(peak<=4);assert.equal(inFlight,0);
});
test('MOV sample offsets and media size use 64 bits for exports over 4 GB',async()=>{
 const writes=[],writer=new PngMovWriter({write:async(data,position)=>writes.push({data,position})},{width,height,fps:30});await writer.start();writer.position=2**32+128;await writer.addFrame(bytes);await writer.finish();
 const moov=writes.find(w=>Buffer.from(w.data.subarray(4,8)).toString()==='moov').data;
 const at=Buffer.from(moov).indexOf('co64');assert.ok(at>0);assert.equal(new DataView(moov.buffer).getBigUint64(at+12),BigInt(2**32+128));
 const sizePatch=writes.at(-1);assert.equal(sizePatch.position,writer.mdatStart+8);assert.ok(new DataView(sizePatch.data.buffer).getBigUint64(0)>2n**32n);
});
