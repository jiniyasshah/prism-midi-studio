import {Synth} from './audio.js';
import {scheduleAudioBuffer} from './audio-sync.js';
import {Output, Mp4OutputFormat, WebMOutputFormat, MovOutputFormat, VideoSampleSource, VideoSample, CanvasSource, AudioBufferSource, Quality, canEncodeVideo, canEncodeAudio} from './vendor/mediabunny.mjs';

import {createExportDestination} from './export-storage.js';
import {PngMovWriter,canvasPng} from './png-mov.js';
import {compactBudget,createMatteSurfaces,compactInstructions,afterEffectsImport} from './compact-export.js';
import {writeStoredZip} from './zip-store.js';

let softwareAacReady=false;
// Keep a CPU available for drawing/UI, and bound the workers' pixel buffers.
// deviceMemory is an approximate browser hint; use a conservative default.
export function proresWorkerCount(width=1920,height=1080,hardware=globalThis.navigator){
 const cores=Math.max(1,Math.floor(hardware?.hardwareConcurrency||4));
 const memoryGiB=Math.max(1,Number(hardware?.deviceMemory)||4);
 const budget=Math.min(1536,memoryGiB*192)*1024*1024;
 const perWorker=32*1024*1024+width*height*32;
 return Math.max(1,Math.min(8,cores>2?cores-1:cores,Math.floor(budget/perWorker)));
}
export async function ensureProResEncoder(width,height){
 const {registerProResEncoder}=await import('./vendor/prores/prores-encoder-mediabunny.mjs');
 const workers=proresWorkerCount(width,height);
 // The library registers once; subsequent calls update the next export's pool.
 registerProResEncoder({workers});return typeof Worker==='undefined'?0:workers;
}

export function exportProgress(label,done,total,elapsedMs,kind){
 const elapsed=Math.max(.001,elapsedMs/1000),rate=done/elapsed;
 const remaining=Math.max(0,Math.ceil((total-done)/rate));
 const eta=remaining>=60?`${Math.floor(remaining/60)}m ${remaining%60}s`:`${remaining}s`;
 const estimate=elapsed>=2&&done>=10?` · ${rate.toFixed(1)} fps · ~${eta} left`:'';
 const storage=kind==='file'?'Saving to disk':kind==='temporary'?'Writing to browser storage':'Writing to memory';
 return `Exporting ${label} · ${Math.round(done/total*100)}%${estimate} · ${storage}`;
}

export async function ensureAudioEncoder(onProgress){
  const config={sampleRate:48000,numberOfChannels:2,quality:new Quality({bitrate:320000})};
  if(await canEncodeAudio('aac',config))return;
  onProgress('Loading software audio encoder…');
  if(!softwareAacReady){const {registerAacEncoder}=await import('./vendor/aac-encoder.mjs');registerAacEncoder();softwareAacReady=true;}
  if(!await canEncodeAudio('aac',config))throw Error('The software audio encoder could not start. Reload Prism and try again.');
}

const yieldToUI=()=>new Promise(resolve=>setTimeout(resolve,0));
const check=signal=>signal.throwIfAborted();
export function exportTiming(start,end,speed,fps){
  if(![start,end,speed,fps].every(Number.isFinite)||end<=start||speed<=0||fps<=0)throw Error('Choose a valid export range and frame rate.');
  const frames=Math.ceil((end-start)/speed*fps);
  return {frames,duration:frames/fps,songTime:i=>Math.min(end,start+i/fps*speed)};
}

// Schedule in one-second batches so finished voices are released and cancellation
// remains available. The synth graph and note envelopes are shared with playback.
export async function renderAudio({song,tracks,settings,volume,speed,start,end,duration,signal,onProgress,external=null,fadeStart=true,fadeEnd=true}){
  const rate=48000,context=new OfflineAudioContext(2,Math.ceil(duration*rate),rate);
  const synth=new Synth();await synth.init(context);
  synth.master.gain.value=volume;synth.wet.gain.value=settings.space*.5;
  const solo=[...tracks.values()].some(t=>t.solo);
  if(external?.buffer&&external.mode!=='synth')scheduleAudioBuffer(context,external.buffer,external,start,end,speed,synth.master,0);
  const notes=external?.buffer&&external.mode==='file'?[]:song.notes.filter(n=>n.end>start&&n.start<end&&!tracks.get(n.trackId).mute&&(!solo||tracks.get(n.trackId).solo));
  let index=0;
  function scheduleUntil(time){
    while(index<notes.length){
      const n=notes[index],offset=Math.max(0,(n.start-start)/speed);
      if(offset>=time)break;
      index++;const length=(Math.min(end,n.end)-Math.max(start,n.start))/speed;
      if(length>0)synth.play(n,tracks.get(n.trackId),offset,length,settings.transpose,settings.brightness);
    }
  }
  check(signal);scheduleUntil(Math.min(1,duration));
  let next=1,suspended=next<duration?context.suspend(next):null;
  const rendered=context.startRendering();
  // Attach rejection handling immediately, including when cancelled mid-render.
  rendered.catch(()=>{});
  try{
  while(suspended){
    await suspended;check(signal);
    onProgress(`Rendering audio · ${Math.round(next/duration*100)}%`);
    scheduleUntil(Math.min(next+1,duration));next++;
    suspended=next<duration?context.suspend(next):null;
    await yieldToUI();check(signal);await context.resume();
  }
  }catch(error){
    // OfflineAudioContext has no close(): release voices, drain scheduled
    // suspension points, and let the native renderer release its buffer.
    synth.stop();context.onstatechange=()=>{if(context.state==='suspended')context.resume().catch(()=>{});};
    await context.resume().catch(()=>{});await rendered.catch(()=>{});context.onstatechange=null;throw error;
  }
  const buffer=await rendered;check(signal);
  // Short edge fades prevent a cut selection from clicking.
  const fade=Math.min(240,Math.floor(buffer.length/2));
  for(let c=0;c<buffer.numberOfChannels;c++){
    const data=buffer.getChannelData(c);
    for(let i=0;i<fade;i++){if(fadeStart)data[i]*=i/fade;if(fadeEnd)data[data.length-1-i]*=i/fade;}
  }
  return buffer;
}

// Include earlier note onsets and a two-second effect tail before each section.
// Replaying that context retains oscillator phase and the existing synth envelopes.
export function audioWindow(song,trackStart,offset,length,speed){
  const boundary=trackStart+offset*speed,history=Math.max(trackStart,boundary-2*speed);
  let windowStart=history;
  for(const n of song.notes){if(n.start>=history)break;if(n.end>=history)windowStart=Math.min(windowStart,Math.max(trackStart,n.start));}
  const skipFrames=Math.round((boundary-windowStart)/speed*48000);
  // Align windowStart with the sample grid so adjoining sections remain aligned.
  windowStart=boundary-skipFrames/48000*speed;
  return {windowStart,skipFrames,lengthFrames:Math.round(length*48000)};
}

export async function exportMp4(options){
  if(options.transparent&&options.transparentFormat==='compact')return exportCompact(options);
  if(options.transparent&&options.transparentFormat==='png')return exportPngMov(options);
  const {canvas,draw,width,height,fps,bitrate,includeAudio,signal,onProgress,start,end,speed,fileHandle}=options;
  const timing=exportTiming(start,end,speed,fps),quality=new Quality({bitrate});
  const transparent=options.transparent===true,prores=transparent&&options.transparentFormat==='prores',codec=prores?'prores':transparent?'vp9':'avc',audioCodec=prores?'pcm-s24':transparent?'opus':'aac',label=prores?'ProRes MOV':transparent?'WebM':'MP4';
  if(prores){onProgress('Loading ProRes 4444 encoder…');await ensureProResEncoder(width,height);}
  const videoConfig={codec,quality,alpha:transparent?'keep':'discard',latencyMode:'quality',keyFrameInterval:2,...(prores?{fullCodecString:'ap4h'}:{})};
  check(signal);
  if(!await canEncodeVideo(codec,{width,height,...videoConfig}))throw Error(`This browser cannot export ${prores?'ProRes MOV':transparent?'VP9 WebM':'H.264 MP4'} at these settings. Try a lower resolution or another browser.`);
  if(includeAudio){
    if(!globalThis.OfflineAudioContext)throw Error('Offline audio rendering is unavailable in this browser.');
    if(prores){if(!await canEncodeAudio(audioCodec,{sampleRate:48000,numberOfChannels:2}))throw Error('PCM audio encoding is unavailable.');}
    else if(transparent){if(!await canEncodeAudio('opus',{sampleRate:48000,numberOfChannels:2,quality:new Quality({bitrate:320000})}))throw Error('Opus audio encoding is unavailable. Turn off Include audio for a silent transparent WebM, or use another browser.');}
    else await ensureAudioEncoder(onProgress);
  }
  check(signal);
  let output,destination;
  try{
    destination=await createExportDestination({fileHandle,estimatedBytes:timing.duration*(prores?width*height*fps*4:(bitrate*(transparent?2:1)+320000)/8*1.25),extension:prores?'mov':transparent?'webm':'mp4',mimeType:prores?'video/quicktime':transparent?'video/webm':'video/mp4'});
    check(signal);draw(start);
    // Standard MP4 with metadata at the end: no whole-file buffering.
    output=new Output({format:prores?new MovOutputFormat({fastStart:false}):transparent?new WebMOutputFormat():new Mp4OutputFormat({fastStart:false}),target:destination.target});
    const video=prores?new VideoSampleSource(videoConfig):new CanvasSource(canvas,videoConfig);
    output.addVideoTrack(video,{frameRate:fps});
    let audioSource;
    if(includeAudio){audioSource=new AudioBufferSource({codec:audioCodec,quality:new Quality({bitrate:320000})});output.addAudioTrack(audioSource);}
    await output.start();
    const sectionFrames=fps*5,started=performance.now();
    let lastYield=started,lastProgress=0;
    for(let section=0;section<timing.frames;section+=sectionFrames){
      check(signal);
      const stopFrame=Math.min(timing.frames,section+sectionFrames),offset=section/fps,length=(stopFrame-section)/fps;
      if(includeAudio){
        const window=audioWindow(options.external?.buffer&&options.external.mode==='file'?{notes:[]}:options.song,start,offset,length,speed);
        // Avoid a single pathological held note allocating an unbounded native buffer.
        if((window.skipFrames+window.lengthFrames)*8>256*1024*1024)throw Error('A very long held note needs too much audio memory. Export a shorter loop selection.');
        onProgress(`Rendering audio · ${Math.round(section/timing.frames*100)}%`);
        let rendered=await renderAudio({...options,start:window.windowStart,duration:(window.skipFrames+window.lengthFrames)/48000,fadeStart:section===0,fadeEnd:stopFrame===timing.frames,onProgress:()=>{}});
        const audio=new AudioBuffer({numberOfChannels:2,length:window.lengthFrames,sampleRate:48000});
        for(let channel=0;channel<2;channel++)audio.copyToChannel(rendered.getChannelData(channel).subarray(window.skipFrames,window.skipFrames+window.lengthFrames),channel);
        rendered=null;check(signal);await audioSource.add(audio);
      }
      for(let i=section;i<stopFrame;i++){
        check(signal);draw(timing.songTime(i));
        if(prores){
          // Read straight RGBA directly, avoiding WebCodecs color/alpha conversion.
          const rgba=canvas.getContext('2d').getImageData(0,0,width,height).data;
          const sample=new VideoSample(rgba,{format:'RGBA',codedWidth:width,codedHeight:height,timestamp:i/fps,duration:1/fps});
          try{await video.add(sample);}finally{sample.close();}
        }else await video.add(i/fps,1/fps);
        const tick=performance.now();
        if(tick-lastProgress>=250||i===timing.frames-1){
          onProgress(exportProgress(label,i+1,timing.frames,tick-started,destination.kind));lastProgress=tick;
        }
        // Yield by elapsed work, not on every frame (nested timers are clamped
        // by browsers). Encoder backpressure still bounds queued frames.
        if(tick-lastYield>=50){await yieldToUI();lastYield=performance.now();}
      }
    }
    check(signal);video.close();audioSource?.close();onProgress(`Finalizing ${label}…`);await output.finalize();check(signal);
    const result=await destination.finish();return {...result,stats:{bytes:destination.bytesWritten,elapsedMs:performance.now()-started,frames:timing.frames,duration:timing.duration}};
  }catch(error){
    if(output)await output.cancel().catch(()=>{});
    if(destination)await destination.abort().catch(()=>{});
    if(error.name==='QuotaExceededError')throw Error(destination?.kind==='file'?'The selected disk ran out of space while writing the video. Free space or choose a different disk.':'Browser temporary storage filled while writing the video. Open Prism in a full desktop browser and choose a save location, or free browser storage and retry.');
    throw error;
  }
}


// Native PNG encoding avoids WASM ProRes and explicit getImageData round-trips.
// PNG compression preserves the canvas RGBA without chroma subsampling.
export async function exportPngMov(options){
 const {canvas,draw,width,height,fps,start,end,speed,includeAudio,signal,onProgress,fileHandle}=options;
 const timing=exportTiming(start,end,speed,fps);let destination;const pending=[];
 if(!canvas.toBlob&&!canvas.convertToBlob)throw Error('PNG encoding is unavailable in this browser.');
 if(includeAudio&&!globalThis.OfflineAudioContext)throw Error('Offline audio rendering is unavailable in this browser.');
 check(signal);const started=performance.now();let lastProgress=0;
 try{
  destination=await createExportDestination({fileHandle,raw:true,estimatedBytes:0,extension:'mov',mimeType:'video/quicktime'});
  const writer=new PngMovWriter(destination,{width,height,fps});await writer.start();
  // toBlob/convertToBlob snapshot pixels when called. Bound the snapshots in
  // flight while native encoders compress them concurrently; write in order.
  const concurrency=Math.min(4,proresWorkerCount(width,height));let completed=0;
  const drain=async()=>{
   const png=await pending.shift();check(signal);await writer.addFrame(png);completed++;
   const tick=performance.now();if(tick-lastProgress>=250||completed===timing.frames){onProgress(exportProgress('PNG MOV',completed,timing.frames,tick-started,destination.kind)+` · ${(writer.position/1048576).toFixed(1)} MB`);lastProgress=tick;await yieldToUI();}
  };
  for(let section=0;section<timing.frames;section+=fps*5){
   const stop=Math.min(timing.frames,section+fps*5);check(signal);
   if(includeAudio){
    onProgress(`Rendering audio · ${Math.round(section/timing.frames*100)}%`);
    const window=audioWindow(options.external?.buffer&&options.external.mode==='file'?{notes:[]}:options.song,start,section/fps,(stop-section)/fps,speed);
    if((window.skipFrames+window.lengthFrames)*8>256*1024*1024)throw Error('A very long held note needs too much audio memory. Export a shorter loop selection.');
    const audio=await renderAudio({...options,start:window.windowStart,duration:(window.skipFrames+window.lengthFrames)/48000,fadeStart:section===0,fadeEnd:stop===timing.frames,onProgress:()=>{}});
    check(signal);await writer.addAudio(audio,window.skipFrames,window.lengthFrames);
   }
   for(let i=section;i<stop;i++){
    check(signal);draw(timing.songTime(i));const encoded=canvasPng(canvas);encoded.catch(()=>{});pending.push(encoded);
    if(pending.length>=concurrency)await drain();
   }
   while(pending.length)await drain();
  }
  check(signal);onProgress('Finalizing PNG MOV…');const bytes=await writer.finish();check(signal);
  const result=await destination.finish();return {...result,stats:{bytes,elapsedMs:performance.now()-started,frames:timing.frames,duration:timing.duration}};
 }catch(error){
  // Native PNG tasks cannot be cancelled; only a bounded number finish in the
  // background. Never write or finalize them after cancellation.
  await destination?.abort().catch(()=>{});
  if(error.name==='QuotaExceededError')throw Error(destination?.kind==='file'?'The selected disk ran out of space. Choose another disk or a smaller frame size.':'Browser temporary storage filled. Open Prism in a full desktop browser and choose a save location.');
  throw error;
 }
}


export async function exportCompact(options){
 const {canvas,draw,width,height,fps,start,end,speed,includeAudio,signal,onProgress,fileHandle}=options;
 const timing=exportTiming(start,end,speed,fps),budget=compactBudget(timing.duration,options.compactQuality,includeAudio);
 if(budget.maxBytes>=0xffffffff)throw Error('This compact package would exceed 4 GB. Choose a shorter range or smaller compact preset.');
 const config=rate=>({codec:'avc',quality:new Quality({bitrate:rate}),alpha:'discard',bitrateMode:'variable',latencyMode:'quality',keyFrameInterval:2});
 check(signal);
 if(!await canEncodeVideo('avc',{width,height,...config(budget.color)})||!await canEncodeVideo('avc',{width,height,...config(budget.matte)}))throw Error('H.264 export is unavailable at these dimensions. Try 1080p or a desktop browser with WebCodecs.');
 if(includeAudio){if(!globalThis.OfflineAudioContext)throw Error('Offline audio rendering is unavailable.');await ensureAudioEncoder(onProgress);}
 let surfaces,packageDestination,colorDestination,matteDestination,colorOutput,matteOutput,colorResult,matteResult;
 const started=performance.now();let lastProgress=0;
 try{
  surfaces=createMatteSurfaces(width,height);
  packageDestination=await createExportDestination({fileHandle,raw:true,estimatedBytes:budget.estimatedBytes,extension:'zip',mimeType:'application/zip',maxBytes:budget.maxBytes});
  colorDestination=await createExportDestination({estimatedBytes:budget.colorBytes,extension:'mp4',maxBytes:budget.colorLimit});
  matteDestination=await createExportDestination({estimatedBytes:budget.matteBytes,extension:'mp4',maxBytes:budget.matteLimit});
  colorOutput=new Output({format:new Mp4OutputFormat({fastStart:false}),target:colorDestination.target});
  matteOutput=new Output({format:new Mp4OutputFormat({fastStart:false}),target:matteDestination.target});
  const color=new CanvasSource(surfaces.color,config(budget.color)),matte=new CanvasSource(surfaces.matte,config(budget.matte));
  colorOutput.addVideoTrack(color,{frameRate:fps});matteOutput.addVideoTrack(matte,{frameRate:fps});
  let audioSource;if(includeAudio){audioSource=new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:320000})});colorOutput.addAudioTrack(audioSource);}
  await colorOutput.start();await matteOutput.start();
  for(let section=0;section<timing.frames;section+=fps*5){
   const stop=Math.min(timing.frames,section+fps*5);check(signal);
   if(includeAudio){
    onProgress(`Rendering audio · ${Math.round(section/timing.frames*100)}%`);
    const window=audioWindow(options.external?.buffer&&options.external.mode==='file'?{notes:[]}:options.song,start,section/fps,(stop-section)/fps,speed);
    if((window.skipFrames+window.lengthFrames)*8>256*1024*1024)throw Error('A very long held note needs too much audio memory. Export a shorter loop selection.');
    const rendered=await renderAudio({...options,start:window.windowStart,duration:(window.skipFrames+window.lengthFrames)/48000,fadeStart:section===0,fadeEnd:stop===timing.frames,onProgress:()=>{}});
    const audio=new AudioBuffer({numberOfChannels:2,length:window.lengthFrames,sampleRate:48000});for(let c=0;c<2;c++)audio.copyToChannel(rendered.getChannelData(c).subarray(window.skipFrames,window.skipFrames+window.lengthFrames),c);check(signal);await audioSource.add(audio);
   }
   for(let i=section;i<stop;i++){
    check(signal);draw(timing.songTime(i));surfaces.draw(canvas);
    // Await both encoders before changing either surface: matching frames and
    // bounded queues even if one native encoder is slower than the other.
    await color.add(i/fps,1/fps);await matte.add(i/fps,1/fps);
    const tick=performance.now();if(tick-lastProgress>=250||i===timing.frames-1){onProgress(exportProgress('compact color + matte',i+1,timing.frames,tick-started,packageDestination.kind));lastProgress=tick;await yieldToUI();}
   }
  }
  check(signal);color.close();matte.close();audioSource?.close();onProgress('Finalizing the two MP4 clips…');await colorOutput.finalize();await matteOutput.finalize();check(signal);
  colorResult=await colorDestination.finish();matteResult=await matteDestination.finish();
  const metadata={width,height,fps,duration:timing.duration};
  const entries=[{name:'color.mp4',blob:colorResult.blob},{name:'alpha.mp4',blob:matteResult.blob},{name:'README.txt',blob:new Blob([compactInstructions(metadata)])},{name:'Import into After Effects.jsx',blob:new Blob([afterEffectsImport(metadata)])}];
  onProgress('Packaging color, alpha, and Adobe import instructions…');const total=entries.reduce((n,e)=>n+e.blob.size,0);const bytes=await writeStoredZip(packageDestination,entries,signal,written=>{const tick=performance.now();if(tick-lastProgress>=250){onProgress(`Packaging Adobe ZIP · ${Math.min(99,Math.round(written/total*100))}%`);lastProgress=tick;}});check(signal);
  const result=await packageDestination.finish();return {...result,stats:{bytes,elapsedMs:performance.now()-started,frames:timing.frames,duration:timing.duration}};
 }catch(error){
  await colorOutput?.cancel().catch(()=>{});await matteOutput?.cancel().catch(()=>{});
  await packageDestination?.abort().catch(()=>{});await colorDestination?.abort().catch(()=>{});await matteDestination?.abort().catch(()=>{});
  if(error.name==='QuotaExceededError')throw Error('Storage filled while exporting. Choose a disk with space and free browser temporary storage.');throw error;
 }finally{surfaces?.close();await colorResult?.cleanup().catch(()=>{});await matteResult?.cleanup().catch(()=>{});}
}
