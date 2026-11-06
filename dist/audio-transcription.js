import {validateAudioFile,audioSections,monoSection,appendSectionNotes,notesToMidi,SAMPLE_RATE} from './transcription-core.js';
export async function transcriptionSamples(buffer,section){
 if(buffer.sampleRate===SAMPLE_RATE)return monoSection(buffer,section);
 // Reuse the playback buffer; resample only the current section, never a
 // second full recording. Native audio resampling supplies the low-pass filter.
 const context=new OfflineAudioContext(1,Math.ceil((section.end-section.start)*SAMPLE_RATE),SAMPLE_RATE);
 const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start(0,section.start,section.end-section.start);
 const rendered=await context.startRendering();return rendered.getChannelData(0);
}
export async function transcribeAudio(file,{audioBuffer=null,signal,onProgress=()=>{},onsetThreshold=.5,frameThreshold=.3,minDuration=.07,workerFactory=url=>new Worker(url),decode}={}){
 validateAudioFile(file);signal?.throwIfAborted();
 if(![onsetThreshold,frameThreshold,minDuration].every(Number.isFinite)||onsetThreshold<.1||onsetThreshold>.95||frameThreshold<.1||frameThreshold>.95||minDuration<.03||minDuration>1)throw Error('Choose valid transcription sensitivity settings.');
 let worker,buffer,pending;
 const abort=()=>{worker?.terminate();pending?.reject(new DOMException('Transcription cancelled.','AbortError'));};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  onProgress({phase:'Decoding audio…',fraction:0});
  if(audioBuffer)buffer=audioBuffer;
  else{
   let encoded=await file.arrayBuffer();signal?.throwIfAborted();
   if(decode)buffer=await decode(encoded);
   else{if(!globalThis.OfflineAudioContext)throw Error('Audio decoding is unavailable. Try a current desktop browser.');buffer=await new OfflineAudioContext(1,1,SAMPLE_RATE).decodeAudioData(encoded);}
   encoded=null;
   if(buffer.sampleRate!==SAMPLE_RATE)throw Error('This browser could not resample the recording to 22,050 Hz. Try another desktop browser.');
  }
  signal?.throwIfAborted();
  if(buffer.length*buffer.numberOfChannels*4>512*1024*1024)throw Error('Decoded audio exceeds 512 MB. Use a shorter recording or a mono audio file.');
  const duration=buffer.duration,sections=audioSections(duration),notes=[];
  worker=workerFactory(new URL('./vendor/basic-pitch/worker.js',import.meta.url));
  const request=(message,transfer=[])=>new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage(message,transfer);});
  let current=0;
  worker.onmessage=({data})=>{if(data.type==='progress'){onProgress({phase:`Transcribing section ${current+1} of ${sections.length}`,fraction:(current+data.fraction)/sections.length});return;}const task=pending;pending=null;if(data.type==='error')task?.reject(Error(data.message));else task?.resolve(data);};
  worker.onerror=()=>{pending?.reject(Error('Could not run the transcription model. Reload while online and retry in a current desktop browser.'));pending=null;};
  onProgress({phase:'Loading Basic Pitch model…',fraction:0});await request({type:'init'});signal?.throwIfAborted();
  for(current=0;current<sections.length;current++){
   signal?.throwIfAborted();const section=sections[current],samples=await transcriptionSamples(buffer,section);
   signal?.throwIfAborted();
   const result=await request({type:'transcribe',samples:samples.buffer,onsetThreshold,frameThreshold,minDuration},[samples.buffer]);signal?.throwIfAborted();
   appendSectionNotes(notes,result.notes,section,duration);
  }
  signal?.throwIfAborted();onProgress({phase:'Creating MIDI…',fraction:1});
  const name=(file.name||'audio').replace(/\.[^.]+$/,'')+'-transcribed.mid';
  return {bytes:notesToMidi(notes,duration,name),name,noteCount:notes.length,duration};
 }finally{signal?.removeEventListener('abort',abort);worker?.terminate();buffer=null;pending=null;}
}
