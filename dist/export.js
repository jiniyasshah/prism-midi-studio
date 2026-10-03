import {Synth} from './audio.js';
import {scheduleAudioBuffer} from './audio-sync.js';
import {Output, Mp4OutputFormat, WebMOutputFormat, MovOutputFormat, VideoSampleSource, VideoSample, CanvasSource, AudioBufferSource, Quality, canEncodeVideo, canEncodeAudio} from './vendor/mediabunny.mjs';

import {createExportDestination} from './export-storage.js';

let softwareAacReady=false;
let proresReady=false;
export async function ensureProResEncoder(){
 if(!proresReady){const {registerProResEncoder}=await import('./vendor/prores/prores-encoder-mediabunny.mjs');registerProResEncoder({workers:Math.min(2,globalThis.navigator?.hardwareConcurrency||1)});proresReady=true;}
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
  const {canvas,draw,width,height,fps,bitrate,includeAudio,signal,onProgress,start,end,speed,fileHandle}=options;
  const timing=exportTiming(start,end,speed,fps),quality=new Quality({bitrate});
  const transparent=options.transparent===true,prores=transparent&&options.transparentFormat==='prores',codec=prores?'prores':transparent?'vp9':'avc',audioCodec=prores?'pcm-s24':transparent?'opus':'aac',label=prores?'ProRes MOV':transparent?'WebM':'MP4';
  if(prores){onProgress('Loading ProRes 4444 encoder…');await ensureProResEncoder();}
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
    const sectionFrames=fps*5;
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
        if(prores||i%5===0){onProgress(`Exporting ${label} · ${Math.round((i+1)/timing.frames*100)}% · ${destination.kind==='file'?'Saving to disk':destination.kind==='temporary'?'Writing to browser storage':'Writing to memory'}`);await yieldToUI();}
      }
    }
    check(signal);video.close();audioSource?.close();onProgress(`Finalizing ${label}…`);await output.finalize();check(signal);
    return await destination.finish();
  }catch(error){
    if(output)await output.cancel().catch(()=>{});
    if(destination)await destination.abort().catch(()=>{});
    if(error.name==='QuotaExceededError')throw Error(destination?.kind==='file'?'The selected disk ran out of space while writing the video. Free space or choose a different disk.':'Browser temporary storage filled while writing the video. Open Prism in a full desktop browser and choose a save location, or free browser storage and retry.');
    throw error;
  }
}
