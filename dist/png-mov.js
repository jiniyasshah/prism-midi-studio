// QuickTime PNG video + optional stereo PCM, written progressively to a
// seekable destination. Only sample tables remain in memory, not video frames.
const text=s=>new TextEncoder().encode(s),zeros=n=>new Uint8Array(n);
const join=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
const u16=n=>{const b=zeros(2);new DataView(b.buffer).setUint16(0,n);return b;};
const u32=n=>{const b=zeros(4);new DataView(b.buffer).setUint32(0,n);return b;};
const u64=n=>{const b=zeros(8);new DataView(b.buffer).setBigUint64(0,BigInt(n));return b;};
const box=(type,...parts)=>{const data=join(...parts);return join(u32(data.length+8),text(type),data);};
const full=(type,flags,...parts)=>box(type,u32(flags),...parts);
const matrix=join(u32(65536),u32(0),u32(0),u32(0),u32(65536),u32(0),u32(0),u32(0),u32(1073741824));
const integers=values=>{const b=zeros(values.length*4),v=new DataView(b.buffer);values.forEach((n,i)=>v.setUint32(i*4,n));return b;};
function videoEntry(width,height){
 const name=zeros(32),label=text('PNG lossless');name[0]=label.length;name.set(label,1);
 return box('png ',zeros(6),u16(1),zeros(16),u16(width),u16(height),u32(72*65536),u32(72*65536),u32(0),u16(1),name,u16(32),u16(65535));
}
function audioEntry(){return box('sowt',zeros(6),u16(1),zeros(8),u16(2),u16(16),u16(0),u16(0),u32(48000*65536));}
function track({id,width=0,height=0,rate,count,sizes,offsets,chunkSamples,entry,audio=false}){
 const duration=Math.round(count/rate*48000);
 const tkhd=full('tkhd',7,u32(0),u32(0),u32(id),u32(0),u32(duration),zeros(8),u16(0),u16(0),u16(audio?256:0),u16(0),matrix,u32(width*65536),u32(height*65536));
 const mdhd=full('mdhd',0,u32(0),u32(0),u32(rate),u32(count),u16(0x55c4),u16(0));
 const hdlr=full('hdlr',0,u32(0),text(audio?'soun':'vide'),zeros(12),text(audio?'Prism Audio\0':'Prism Video\0'));
 const chunks=[];let prior=0;chunkSamples.forEach((samples,i)=>{if(samples!==prior){chunks.push(i+1,samples,1);prior=samples;}});
 const positions=zeros(offsets.length*8),pv=new DataView(positions.buffer);offsets.forEach((n,i)=>pv.setBigUint64(i*8,BigInt(n)));
 const stbl=box('stbl',full('stsd',0,u32(1),entry),full('stts',0,u32(1),u32(count),u32(1)),
  full('stsc',0,u32(chunks.length/3),integers(chunks)),
  full('stsz',0,u32(audio?4:0),u32(count),audio?zeros(0):integers(sizes)),full('co64',0,u32(offsets.length),positions));
 const dinf=box('dinf',full('dref',0,u32(1),full('url ',1)));
 const mediaHeader=audio?full('smhd',0,zeros(4)):full('vmhd',1,zeros(8));
 return box('trak',tkhd,box('mdia',mdhd,hdlr,box('minf',mediaHeader,dinf,stbl)));
}
export class PngMovWriter {
 constructor(destination,{width,height,fps}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||![30,60].includes(fps))throw Error('Invalid PNG MOV dimensions or frame rate.');
  this.destination=destination;this.width=width;this.height=height;this.fps=fps;this.position=0;this.sizes=[];this.offsets=[];this.audioOffsets=[];this.audioChunks=[];this.audioFrames=0;this.closed=false;
 }
 async write(data){await this.destination.write(data,this.position);this.position+=data.length;}
 async start(){await this.write(box('ftyp',text('qt  '),u32(0),text('qt  ')));this.mdatStart=this.position;await this.write(join(u32(1),text('mdat'),u64(16)));}
 async addFrame(bytes){
  if(this.closed)throw Error('The MOV writer is closed.');
  const signature=[137,80,78,71,13,10,26,10];if(bytes.length<33||!signature.every((v,i)=>bytes[i]===v))throw Error('The browser did not return a PNG frame.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(v.getUint32(16)!==this.width||v.getUint32(20)!==this.height)throw Error('PNG frame dimensions changed during export.');
  this.offsets.push(this.position);this.sizes.push(bytes.length);await this.write(bytes);
 }
 async addAudio(buffer,skip,length){
  if(this.closed)throw Error('The MOV writer is closed.');
  if(buffer.sampleRate!==48000||buffer.numberOfChannels!==2||skip<0||length<1||skip+length>buffer.length)throw Error('Invalid PCM audio window.');
  const data=zeros(length*4),view=new DataView(data.buffer),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  for(let i=0;i<length;i++)for(let c=0;c<2;c++){const sample=Math.max(-1,Math.min(1,(c?right:left)[skip+i]));view.setInt16(i*4+c*2,Math.round(sample*(sample<0?32768:32767)),true);}
  this.audioOffsets.push(this.position);this.audioChunks.push(length);this.audioFrames+=length;await this.write(data);
 }
 async finish(){
  if(this.closed||!this.sizes.length)throw Error('The MOV contains no video frames.');this.closed=true;
  const mediaEnd=this.position,duration=Math.round(this.sizes.length/this.fps*48000);
  const mvhd=full('mvhd',0,u32(0),u32(0),u32(48000),u32(duration),u32(65536),u16(256),zeros(10),matrix,zeros(24),u32(this.audioFrames?3:2));
  const video=track({id:1,width:this.width,height:this.height,rate:this.fps,count:this.sizes.length,sizes:this.sizes,offsets:this.offsets,chunkSamples:this.sizes.map(()=>1),entry:videoEntry(this.width,this.height)});
  const audio=this.audioFrames?track({id:2,rate:48000,count:this.audioFrames,offsets:this.audioOffsets,chunkSamples:this.audioChunks,entry:audioEntry(),audio:true}):zeros(0);
  await this.write(box('moov',mvhd,video,audio));await this.destination.write(u64(mediaEnd-this.mdatStart),this.mdatStart+8);
  return this.position;
 }
}
export async function canvasPng(canvas){
 const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise((resolve,reject)=>{canvas.toBlob(value=>value?resolve(value):reject(Error('PNG encoding failed.')), 'image/png');});
 if(blob.type!=='image/png')throw Error('This browser cannot encode PNG frames.');
 return new Uint8Array(await blob.arrayBuffer());
}
