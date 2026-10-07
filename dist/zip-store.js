// Streaming ZIP (stored entries: MP4 is already compressed). Classic ZIP limits
// are explicit; this compact-export path rejects budgets >= 4 GiB up front.
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
export function crc32(bytes,crc=0xffffffff){for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return crc>>>0;}
const encode=s=>new TextEncoder().encode(s);
function record(size,signature){const bytes=new Uint8Array(size),v=new DataView(bytes.buffer);v.setUint32(0,signature,true);return {bytes,v};}
export async function writeStoredZip(destination,entries,signal,onProgress=()=>{}){
 let position=0,lastYield=0;const central=[];
 const write=async data=>{signal.throwIfAborted();if(position+data.length>=0xffffffff)throw Error('The compact package exceeds ZIP size limits. Choose a shorter range or smaller preset.');await destination.write(data,position);position+=data.length;};
 for(const {name,blob} of entries){
  if(!/^[\w .-]+$/.test(name)||blob.size>=0xffffffff)throw Error('Invalid ZIP entry.');
  const filename=encode(name),offset=position,{bytes:header,v}=record(30,0x04034b50);v.setUint16(4,20,true);v.setUint16(6,0x808,true);v.setUint16(12,33,true);v.setUint16(26,filename.length,true);
  await write(header);await write(filename);let crc=0xffffffff,size=0;const reader=blob.stream().getReader();
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;crc=crc32(value,crc);size+=value.length;await write(value);onProgress(position);if(position-lastYield>=4*1024**2){await new Promise(resolve=>setTimeout(resolve,0));lastYield=position;}}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  crc=(crc^0xffffffff)>>>0;const {bytes:descriptor,v:d}=record(16,0x08074b50);d.setUint32(4,crc,true);d.setUint32(8,size,true);d.setUint32(12,size,true);await write(descriptor);
  const {bytes:c,v:cv}=record(46,0x02014b50);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x808,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);central.push(c,filename);
 }
 const centralStart=position;for(const bytes of central)await write(bytes);const centralSize=position-centralStart;
 const {bytes:end,v}=record(22,0x06054b50);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,centralStart,true);await write(end);return position;
}
