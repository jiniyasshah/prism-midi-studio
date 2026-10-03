const decoder = new TextDecoder();
export const GM_NAMES = ['Acoustic Grand Piano','Bright Piano','Electric Grand','Honky-tonk Piano','Electric Piano 1','Electric Piano 2','Harpsichord','Clavinet','Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer','Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion','Nylon Guitar','Steel Guitar','Jazz Guitar','Clean Guitar','Muted Guitar','Overdriven Guitar','Distortion Guitar','Guitar Harmonics','Acoustic Bass','Finger Bass','Pick Bass','Fretless Bass','Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2','Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani','String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2','Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit','Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2','Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet','Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina','Square Lead','Saw Lead','Calliope Lead','Chiff Lead','Charang Lead','Voice Lead','Fifths Lead','Bass & Lead','New Age Pad','Warm Pad','Polysynth Pad','Choir Pad','Bowed Pad','Metallic Pad','Halo Pad','Sweep Pad','Rain FX','Soundtrack FX','Crystal FX','Atmosphere FX','Brightness FX','Goblins FX','Echoes FX','Sci-fi FX','Sitar','Banjo','Shamisen','Koto','Kalimba','Bagpipe','Fiddle','Shanai','Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal','Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone','Helicopter','Applause','Gunshot'];
export function parseMidi(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer); let pos = 0;
  const need = n => { if (pos + n > bytes.length) throw Error('This MIDI file is incomplete or damaged.'); };
  const u8 = () => {need(1);return bytes[pos++];};
  const u16 = () => {need(2);const v=view.getUint16(pos);pos+=2;return v;};
  const u32 = () => {need(4);const v=view.getUint32(pos);pos+=4;return v;};
  const str = n => {need(n);const v=decoder.decode(bytes.subarray(pos,pos+n));pos+=n;return v;};
  const vlq = () => {let v=0;for(let i=0;i<4;i++){const b=u8();v=v*128+(b&127);if(!(b&128))return v;}throw Error('Invalid MIDI event length.');};
  if(str(4)!=='MThd') throw Error('Please choose a Standard MIDI file (.mid or .midi).');
  const headerLen=u32();if(headerLen<6)throw Error('Invalid MIDI header.');
  const format=u16(), count=u16(), ppq=u16();
  if(format>1)throw Error('MIDI format 2 is not supported. Export your file as format 0 or 1.');
  if(ppq&0x8000)throw Error('SMPTE timing is not supported. Export your MIDI with a musical tempo.');
  if(!ppq || !count || count>4096)throw Error('Invalid MIDI timing or track count.');
  need(headerLen-6);pos+=headerLen-6;
  const events=[], names=[], tempos=[{tick:0,mpqn:500000}], signatures=[];let lastTick=0, seq=0;
  for(let ti=0;ti<count;ti++){
    const chunk=str(4),len=u32();need(len);const end=pos+len;
    if(chunk!=='MTrk')throw Error('A MIDI track is missing or damaged.');
    let tick=0,running=0;
    while(pos<end){
      tick+=vlq();lastTick=Math.max(lastTick,tick);let status=u8();
      if(status<0x80){if(!running)throw Error('Invalid MIDI running status.');pos--;status=running;}
      else if(status<0xf0)running=status;
      if(status===0xff){const type=u8(),n=vlq();need(n);if(pos+n>end)throw Error('Invalid MIDI metadata length.');
        if(type===3)names[ti]=decoder.decode(bytes.subarray(pos,pos+n)).replace(/[\u0000-\u001f]/g,'').trim();
        if(type===0x51&&n===3){const mpqn=bytes[pos]*65536+bytes[pos+1]*256+bytes[pos+2];if(mpqn)tempos.push({tick,mpqn});}
        if(type===0x58&&n>=2)signatures.push({tick,numerator:bytes[pos],denominator:2**bytes[pos+1]});
        pos+=n;if(type===0x2f){pos=end;break;}continue;
      }
      if(status===0xf0||status===0xf7){const n=vlq();need(n);pos+=n;running=0;continue;}
      if(status>=0xf0)throw Error('Unsupported system event in MIDI file.');
      const kind=status>>4,ch=status&15,a=u8(),b=kind===12||kind===13?0:u8();
      if(a>127||b>127)throw Error('Invalid MIDI channel data.');
      events.push({tick,kind,ch,a,b,ti,seq:seq++});
      if(events.length>2500000)throw Error('This file has too many events. Please use a smaller MIDI arrangement.');
    }
    if(pos!==end)throw Error('MIDI event exceeds its track boundary.');
  }
  tempos.sort((a,b)=>a.tick-b.tick);const tempoMap=[];let ts=0,tt=0,mp=500000;
  for(const tempo of tempos){ts+=(tempo.tick-tt)*mp/(ppq*1e6);tt=tempo.tick;mp=tempo.mpqn;
    if(tempoMap.at(-1)?.tick===tt)tempoMap.pop();tempoMap.push({...tempo,seconds:ts});}
  const toSeconds=tick=>{let lo=0,hi=tempoMap.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(tempoMap[m].tick<=tick)lo=m;else hi=m-1;}const t=tempoMap[lo];return t.seconds+(tick-t.tick)*t.mpqn/(ppq*1e6);};
  events.sort((a,b)=>a.tick-b.tick||a.seq-b.seq);
  const tracks=new Map(),active=new Map(),pending=Array.from({length:16},()=>[]),sustain=Array(16).fill(false),programs=Array(16).fill(0),volumes=Array(16).fill(100/127),expressions=Array(16).fill(1),pans=Array(16).fill(0),notes=[];
  const close=(n,tick)=>{n.end=toSeconds(Math.max(n.tick+1,tick));n.duration=n.end-n.start;delete n.tick;};
  for(const e of events){const {ch,ti,a,b,tick,kind}=e;const id=`${ti}:${ch}`,key=`${id}:${a}`;
    if(kind===12){programs[ch]=a;continue;}
    if(kind===11){if(a===7)volumes[ch]=b/127;if(a===11)expressions[ch]=b/127;if(a===10)pans[ch]=(b-64)/64;
      if(a===64){sustain[ch]=b>=64;if(!sustain[ch]){pending[ch].forEach(n=>close(n,tick));pending[ch]=[];}}
      if(a===120||a===123){for(const [k,queue]of active)if(queue[0]?.channel===ch){queue.forEach(n=>close(n,tick));active.delete(k);}pending[ch].forEach(n=>close(n,tick));pending[ch]=[];}
      continue;}
    if(kind===9&&b>0){
      if(!tracks.has(id))tracks.set(id,{id,name:names[ti]|| (ch===9?'Drums':GM_NAMES[programs[ch]]),channel:ch,program:programs[ch],count:0});
      const note={trackId:id,channel:ch,pitch:a,velocity:b/127,volume:volumes[ch]*expressions[ch],pan:pans[ch],program:programs[ch],tick,start:toSeconds(tick),end:0,duration:0};
      notes.push(note);tracks.get(id).count++;if(!active.has(key))active.set(key,[]);active.get(key).push(note);
      if(notes.length>300000)throw Error('Please use a MIDI file with fewer than 300,000 notes.');
    }else if(kind===8||(kind===9&&b===0)){const queue=active.get(key);if(queue?.length){const n=queue.shift();if(sustain[ch]&&ch!==9)pending[ch].push(n);else close(n,tick);if(!queue.length)active.delete(key);}}
  }
  for(const queue of active.values())queue.forEach(n=>close(n,lastTick));pending.flat().forEach(n=>close(n,lastTick));
  if(!notes.length)throw Error('This file contains no playable notes.');
  notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  let noteEnd=0,min=127,max=0;for(const n of notes){noteEnd=Math.max(noteEnd,n.end);if(n.channel!==9){min=Math.min(min,n.pitch);max=Math.max(max,n.pitch);}}
  if(min>max){min=36;max=84;}
  return{notes,tracks:[...tracks.values()],duration:Math.max(noteEnd,toSeconds(lastTick))+1,tempoMap,bpm:Math.round(60e6/tempoMap[0].mpqn),min,max,signatures,format,ppq};
}

export function demoSong(){
  const notes=[],beat=.625;const progression=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]];
  const add=(trackId,pitch,b,dur,velocity,program)=>notes.push({trackId,channel:Number(trackId),pitch,start:b*beat,end:(b+dur)*beat,duration:dur*beat,velocity,volume:1,pan:0,program});
  for(let bar=0;bar<16;bar++){const chord=progression[bar%4];
    for(let s=0;s<8;s++){add('0',chord[s%4]+12,bar*4+s*.5,.46,.4+((s*7+bar*3)%5)*.08,0);}
    add('1',chord[0]-12,bar*4,3.7,.47,88);add('1',chord[2],bar*4+.03,3.5,.22,88);
    for(let s=0;s<4;s++){const melody=[76,79,81,79,76,72,74,71,69,72,76,74,71,67,69,74];add('2',melody[(bar*2+s)%melody.length],bar*4+s,.72,.42+(s%2)*.14,10);}
  }
  notes.sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  return{notes,tracks:[{id:'0',name:'Glass piano',channel:0,program:0,count:128},{id:'1',name:'Warm horizon',channel:1,program:88,count:32},{id:'2',name:'First light',channel:2,program:10,count:64}],duration:41,bpm:96,min:29,max:81,tempoMap:[{tick:0,seconds:0,mpqn:625000}],signatures:[{tick:0,numerator:4,denominator:4}]};
}
