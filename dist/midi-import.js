import {parseMidi} from './midi.js';

const MAX_FILES=64,MAX_BYTES=100*1024*1024,MAX_NOTES=300000;
const stem=name=>name.replace(/\.(mid|midi)$/i,'');
const cleanStem=name=>stem(name).replace(/\s*\(\d+\)$/,'').trim();
export function midiFileLabel(name){
 const clean=cleanStem(name),part=clean.match(/\(([^()]+)\)$/);
 return part?part[1].trim():clean;
}
const compare=(a,b)=>a.name<b.name?-1:a.name>b.name?1:a.id<b.id?-1:a.id>b.id?1:0;
const sameTempo=(a,b)=>a.length===b.length&&a.every((s,i)=>s.mpqn===b[i].mpqn&&Math.abs(s.seconds-b[i].seconds)<1e-6);

export function mergeMidiSources(input){
 if(!input.length)throw Error('Choose at least one MIDI file.');
 const sources=[...input].sort(compare),primary=sources[0],tracks=[],notes=[];
 let duration=0,min=127,max=0;
 for(const source of sources){
  const song=source.song;
  if(notes.length+song.notes.length>MAX_NOTES)throw Error('The combined arrangement exceeds 300,000 notes. Choose fewer MIDI files.');
  const ids=new Map();
  song.tracks.forEach((track,i)=>{
   const id=`${source.id}/${track.id}`;ids.set(track.id,id);
   tracks.push({...track,id,originalId:track.id,originalName:track.name,sourceId:source.id,sourceName:source.name,
    name:song.tracks.length===1?source.label:`${source.label} · ${track.name} · ${i+1}`});
  });
  // Files are parsed separately so channel/program/sustain state cannot leak
  // between instruments. Keep absolute seconds, including initial silence.
  for(const note of song.notes){notes.push({...note,trackId:ids.get(note.trackId)});if(note.channel!==9){min=Math.min(min,note.pitch);max=Math.max(max,note.pitch);}}
  duration=Math.max(duration,song.duration);
 }
 notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 if(min>max){min=36;max=84;}
 const bases=sources.map(s=>cleanStem(s.name).replace(/\s*\([^()]+\)$/,'').trim());
 const title=sources.length===1?stem(primary.name):bases[0]&&bases.every(b=>b===bases[0])?bases[0]:`${stem(primary.name)} + ${sources.length-1} MIDI files`;
 const tempoMismatch=sources.some(s=>!sameTempo(primary.song.tempoMap,s.song.tempoMap));
 return {title,song:{...primary.song,notes,tracks,duration,min,max,
  sources:sources.map(({id,name,label})=>({id,name,label})),tempoMismatch,tempoSource:primary.name}};
}

// Build the whole batch before the caller replaces the active arrangement.
export async function importMidiFiles(fileList,existing=[],onProgress=()=>{}){
 const files=Array.from(fileList||[]);
 if(!files.length)throw Error('Choose one or more .mid or .midi files.');
 if(files.length>MAX_FILES)throw Error('Choose up to 64 MIDI files at once.');
 for(const file of files){
  if(!/\.(mid|midi)$/i.test(file.name))throw Error(`${file.name}: choose only .mid or .midi files.`);
  if(file.size>50*1024*1024)throw Error(`${file.name}: choose a MIDI file smaller than 50 MB.`);
 }
 if(files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)throw Error('Choose a MIDI batch smaller than 100 MB.');
 const sources=new Map(existing.map(s=>[s.id,s]));let totalNotes=existing.reduce((n,s)=>n+s.song.notes.length,0);let skipped=0,totalBytes=existing.reduce((n,s)=>n+s.size,0);
 for(let i=0;i<files.length;i++){
  const file=files[i];onProgress(`Reading MIDI ${i+1} of ${files.length}…`);
  // Let progress paint before parsing another file.
  await new Promise(resolve=>setTimeout(resolve,0));
  try{
   const buffer=await file.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
   const id=`${encodeURIComponent(file.name)}:${hash}`;
   if(sources.has(id)){skipped++;continue;}
   if(sources.size>=MAX_FILES)throw Error('An arrangement can contain up to 64 MIDI files.');
   totalBytes+=file.size;if(totalBytes>MAX_BYTES)throw Error('The combined MIDI files exceed 100 MB.');
   const song=parseMidi(buffer);totalNotes+=song.notes.length;if(totalNotes>MAX_NOTES)throw Error('The combined arrangement exceeds 300,000 notes. Choose fewer MIDI files.');
   sources.set(id,{id,name:file.name,label:midiFileLabel(file.name),size:file.size,song});
  }catch(error){throw Error(`${file.name}: ${error.message||'Could not read this MIDI file.'}`);}
 }
 const result=[...sources.values()].sort(compare);
 return {sources:result,skipped,...mergeMidiSources(result)};
}
