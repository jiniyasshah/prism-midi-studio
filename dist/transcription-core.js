export const AUDIO_MAX_BYTES=150*1024*1024,SAMPLE_RATE=22050,SECTION_SECONDS=30,CONTEXT_SECONDS=2;
export function validateAudioFile(file){
 if(!file||!Number.isFinite(file.size)||file.size<=0)throw Error('Choose a non-empty audio file.');
 if(file.size>AUDIO_MAX_BYTES)throw Error('Choose an audio file up to 150 MB (150 MiB).');
 if(!/^audio\//i.test(file.type||'')&&!/\.(mp3|wav|wave|flac|m4a|aac|ogg|oga|opus|aif|aiff|webm|mp4)$/i.test(file.name||''))throw Error('Choose an audio recording such as MP3, WAV, FLAC, M4A or OGG.');
}
export function audioSections(duration){
 if(!Number.isFinite(duration)||duration<=0)throw Error('This recording has no audio.');
 const sections=[];for(let from=0;from<duration;from+=SECTION_SECONDS)sections.push({from,to:Math.min(duration,from+SECTION_SECONDS),start:Math.max(0,from-CONTEXT_SECONDS),end:Math.min(duration,from+SECTION_SECONDS+CONTEXT_SECONDS)});return sections;
}
export function monoSection(buffer,section){
 const first=Math.floor(section.start*buffer.sampleRate),last=Math.min(buffer.length,Math.ceil(section.end*buffer.sampleRate)),mono=new Float32Array(last-first);
 for(let c=0;c<buffer.numberOfChannels;c++){const channel=buffer.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[first+i]/buffer.numberOfChannels;}
 return mono;
}
// Keep only each section's central interval. Join a held note across the seam
// only if the next contextual prediction began before that interval.
export function appendSectionNotes(notes,incoming,section,duration){
 const previous=new Map();for(let i=notes.length-1;i>=0;i--){const n=notes[i];if(n.end>=section.from-.06&&!previous.has(n.pitch))previous.set(n.pitch,n);}
 for(const n of incoming.slice().sort((a,b)=>a.startTimeSeconds-b.startTimeSeconds)){
  const rawStart=section.start+n.startTimeSeconds,rawEnd=rawStart+n.durationSeconds;
  if(![rawStart,rawEnd,n.pitchMidi,n.amplitude].every(Number.isFinite)||rawEnd<=section.from||rawStart>=section.to)continue;
  const start=Math.max(section.from,0,rawStart),end=Math.min(section.to,duration,rawEnd),pitch=Math.round(n.pitchMidi);
  if(end<=start||pitch<0||pitch>127)continue;
  const old=previous.get(pitch);
  if(rawStart<section.from-.02&&old&&Math.abs(old.end-start)<.06){old.end=Math.max(old.end,end);previous.delete(pitch);}
  else notes.push({start,end,pitch,velocity:Math.max(1/127,Math.min(1,n.amplitude))});
 }
 if(notes.length>300000)throw Error('Transcription exceeds 300,000 notes. Use a shorter recording or a higher onset threshold.');
 return notes;
}
export function notesToMidi(notes,duration,name='Audio transcription'){
 if(!notes.length)throw Error('No notes detected. Try a clearer instrument recording or lower the onset threshold.');
 const events=[];for(const n of notes){const start=Math.max(0,Math.round(n.start*1000)),end=Math.max(start+1,Math.round(n.end*1000));events.push({tick:start,off:false,pitch:n.pitch,value:Math.max(1,Math.min(127,Math.round(n.velocity*127)))});events.push({tick:end,off:true,pitch:n.pitch,value:0});}
 events.sort((a,b)=>a.tick-b.tick||Number(b.off)-Number(a.off)||a.pitch-b.pitch);
 const vlq=n=>{if(!Number.isSafeInteger(n)||n<0||n>0x0fffffff)throw Error('Recording is too long for MIDI export.');const b=[n&127];while(n>>>=7)b.unshift((n&127)|128);return b;};
 const label=[...new TextEncoder().encode(name)].slice(0,120);
 // 500 PPQ and 120 BPM = 1 tick per millisecond; this is a timing grid,
 // not beat/tempo detection. Preserve absolute note times and leading silence.
 const track=[0,255,3,...vlq(label.length),...label,0,255,81,3,7,161,32,0,192,0];let tick=0;
 for(const e of events){track.push(...vlq(e.tick-tick),e.off?128:144,e.pitch,e.value);tick=e.tick;}
 track.push(...vlq(Math.max(tick,Math.round(duration*1000))-tick),255,47,0);
 const bytes=new Uint8Array(22+track.length),view=new DataView(bytes.buffer);bytes.set([77,84,104,100,0,0,0,6,0,0,0,1,1,244,77,84,114,107]);view.setUint32(18,track.length);bytes.set(track,22);return bytes;
}
