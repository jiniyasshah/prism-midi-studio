import {BufferTarget,StreamTarget} from './vendor/mediabunny.mjs';

// The picker must run directly from the button's user gesture.
export async function pickExportFile(name,transparent=false,prores=false){
  if(!globalThis.showSaveFilePicker)return null;
  try{return await showSaveFilePicker({suggestedName:name,types:[prores?{description:'ProRes 4444 MOV',accept:{'video/quicktime':['.mov']}}:transparent?{description:'Transparent WebM video',accept:{'video/webm':['.webm']}}:{description:'MP4 video',accept:{'video/mp4':['.mp4']}}]});}
  catch(error){if(error.name==='AbortError')throw error;if(['SecurityError','NotAllowedError'].includes(error.name))return null;throw error;}
}

export async function createExportDestination({fileHandle,estimatedBytes,extension='mp4',mimeType='video/mp4'}){
  let handle=fileHandle,root=null,name=null;
  if(!handle&&navigator.storage?.getDirectory){
    try{
      root=await (await navigator.storage.getDirectory()).getDirectoryHandle('prism-exports',{create:true});
      // Quota estimates and codec size estimates are not reservations. In particular,
      // raw RGBA size grossly overestimates ProRes. Let actual disk writes enforce
      // the quota instead of rejecting a render before encoding its first frame.
      // Only remove abandoned exports created by this app, after 24 hours.
      for await(const [entry,entryHandle] of root.entries()){
        const match=/^prism-(\d+)-[a-z0-9-]+\.(?:mp4|webm|mov)$/.exec(entry);
        if(entryHandle.kind==='file'&&match&&Date.now()-Number(match[1])>86400000)await root.removeEntry(entry).catch(()=>{});
      }
      name=`prism-${Date.now()}-${crypto.randomUUID()}.${extension}`;
      handle=await root.getFileHandle(name,{create:true});
    }catch(error){
      if(error.name==='QuotaExceededError')throw new DOMException('Browser temporary storage is full. Open Prism in a full desktop browser and choose a save location, or free browser storage and retry.','QuotaExceededError');
      root=null;name=null;handle=null;
    }
  }
  if(!handle){
    if(estimatedBytes>192*1024*1024)throw Error('This browser blocks disk-backed export. Open Prism in a full browser window with file-saving or temporary-storage support to export this size.');
    const target=new BufferTarget();
    return {target,kind:'memory',finish:async()=>({blob:new Blob([target.buffer],{type:mimeType}),cleanup:async()=>{}}),abort:async()=>{}};
  }
  const remove=async()=>{if(root&&name)await root.removeEntry(name).catch(()=>{});};
  let writable;
  try{writable=await handle.createWritable();}catch(error){await remove();throw error;}
  // Mediabunny closes its stream on cancellation too. Keep the file transaction
  // separate: only finish() commits it, while abort() discards partial bytes.
  const stream=new WritableStream({write:chunk=>writable.write(chunk)});
  const target=new StreamTarget(stream,{chunked:true,chunkSize:2*1024*1024});
  let committed=false;
  return {
    target,kind:root?'temporary':'file',
    async finish(){await writable.close();committed=true;if(root){const file=await handle.getFile();return {blob:file.slice(0,file.size,mimeType),cleanup:remove};}return {saved:true,cleanup:async()=>{}};},
    async abort(){if(!committed)await writable.abort().catch(()=>{});await remove();}
  };
}
