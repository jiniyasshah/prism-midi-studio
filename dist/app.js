import {demoSong,GM_NAMES} from './midi.js';
import {importMidiFiles} from './midi-import.js';
import {Synth} from './audio.js';
import {resolveFrame,resolveCustomResolution,fitFrame} from './frame-size.js';
import {drawAtmosphere,atmospherePresets} from './atmosphere.js';
import {drawCreativeScene} from './creative-scenes.js';
import {scheduleAudioBuffer,makeWaveform} from './audio-sync.js';
import {palettes,paletteNames,modeNames,drawBackground,drawParticles,drawExtraScene,midiEnergy} from './studio-visuals.js';
import {exportMp4} from './export.js';
import {exportReport} from './export-report.js';
import {parseScene} from './scene-settings.js';
import {pickExportFile} from './export-storage.js';
const $=id=>document.getElementById(id), $$=s=>[...document.querySelectorAll(s)];
const defaults={dustEnabled:true,imageEnabled:true,notesEnabled:true,mode:'vertical',preset:'aurora',timeWindow:7,noteWidth:.82,roundness:5,opacity:.88,velocitySize:true,glow:18,glowStrength:.55,particles:true,particleCount:12,particleSize:2,particleSpread:36,particleLife:.8,trails:true,trailLength:1.4,cometSize:4,grid:true,gridOpacity:.13,beatLines:true,keyboard:true,keyboardHeight:62,keyLabels:true,noteLabels:false,octaveLines:true,background:'#080c17',ambient:true,ambientStrength:.18,playhead:true,playheadColor:'#b9d9ff',playheadWidth:1.2,gradient:true,transpose:0,pitchRange:'auto',minPitch:21,maxPitch:108,brightness:.5,space:.35,colorMode:'track',saturation:100,zoom:1,showTime:false,showTitle:false,titleSize:24,horizontalHead:.16,sustainGlow:true,customColors:palettes.aurora.join(','),particleVelocity:true,particleShape:'dots',particleMotion:'burst',orbitRadius:.25,pulseHeight:1,ribbonWave:20,bgMotion:'drift',bgMovement:.5,bgSpeed:1,bgOpacity:1,bgBlur:3,bgSaturation:85,bgBrightness:1,bgPulse:.4,bgDim:.35,bgVignette:.65,bgTint:'#a78af3',bgTintAmount:.12,bgDust:60,dustColorMode:'palette',dustColor:'#d8ccff',dustShape:'dots',dustSize:4,dustVariation:.4,dustOpacity:.6,dustGlow:8,dustSpeed:.6,dustDirection:270,dustMotion:'drift',dustClockwise:true,dustWander:.4,dustTwinkle:.35,dustBeat:false,dustBeatStrength:.6,dustBeatDivision:1,dustBeatDecay:6,dustBlend:'screen',dustSeed:42,dustFlutter:.6,dustSpin:.7,spiralTurns:1.4,creativeRotation:.1,tunnelDepth:6,rippleSize:90,rippleLife:3};
let saved={};try{saved=JSON.parse(localStorage.getItem('prism-settings')||'{}')||{};}catch{}
let settings={...defaults};for(const k of Object.keys(defaults)){if(typeof saved[k]===typeof defaults[k])settings[k]=saved[k];}
for(const key of ['background','playheadColor','bgTint','dustColor'])if(!/^#[0-9a-f]{6}$/i.test(settings[key]))settings[key]=defaults[key];
if(!/^(#[0-9a-f]{6},){5}#[0-9a-f]{6}$/i.test(settings.customColors))settings.customColors=defaults.customColors;palettes.custom=settings.customColors.split(',');
if(!Object.hasOwn(palettes,settings.preset))settings.preset='aurora';if(!Object.hasOwn(modeNames,settings.mode))settings.mode='vertical';
const originalGroups=[
  {name:'Notes & motion',open:true,items:[['timeWindow','Visible time',2,20,.5,' s'],['noteWidth','Note width',.25,1,.01,'%'],['roundness','Roundness',0,18,1,' px'],['opacity','Note opacity',.1,1,.01,'%'],['velocitySize','Size by velocity','toggle'],['gradient','Gradient notes','toggle'],['noteLabels','Show note names','toggle'],['colorMode','Color by','select',[['track','Track'],['pitch','Pitch class'],['velocity','Velocity']]],['zoom','Pitch zoom',.5,2,.05,'×']]},
  {name:'Key-hit particles & glow',open:true,items:[['glow','Glow radius',0,50,1,' px'],['glowStrength','Glow strength',0,1,.01,'%'],['sustainGlow','Illuminate held notes','toggle'],['particles','Particle effects','toggle'],['particleCount','Particles per hit',0,120,1,''],['particleVelocity','Scale amount by velocity','toggle'],['particleMotion','Emission','select',[['burst','Burst on note hit'],['stream','Stream while held']]],['particleShape','Particle shape','select',[['dots','Soft dots'],['sparks','Light sparks'],['squares','Confetti']]],['particleSize','Particle size',.5,5,.1,' px'],['particleSpread','Particle spread',5,200,1,' px'],['particleLife','Particle lifetime',.2,4,.1,' s']]},
  {name:'New style controls',items:[['orbitRadius','Orbit radius',.12,.38,.01,'%'],['pulseHeight','Pulse bar height',.3,1.2,.05,'×'],['ribbonWave','Ribbon wave',0,60,1,' px'],['spiralTurns','Spiral turns',.3,3,.1,''],['creativeRotation','Spiral rotation',0,.5,.01,' rad/s'],['tunnelDepth','Tunnel depth',2,12,1,''],['rippleSize','Ripple size',20,160,5,' px'],['rippleLife','Ripple lifetime',.5,4,.1,' s']]},
  {name:'Image effects',panel:'scene',open:true,items:[['bgMotion','Motion','select',[['drift','Slow pan'],['zoom','Breathing zoom'],['still','Still']]],['bgMovement','Movement amount',0,1,.01,'%'],['bgSpeed','Movement speed',.1,3,.1,'×'],['bgPulse','Note-hit pulse',0,1,.01,'%'],['bgBlur','Soft focus',0,24,1,' px'],['bgBrightness','Brightness',.3,1.8,.05,'×'],['bgSaturation','Image saturation',0,150,1,'%raw'],['bgOpacity','Image opacity',0,1,.01,'%'],['bgDim','Darken image',0,.9,.01,'%'],['bgVignette','Vignette',0,1,.01,'%'],['bgTint','Color wash','color'],['bgTintAmount','Color wash strength',0,.7,.01,'%']]},
  {name:'Comet trails',items:[['trails','Show tails','toggle'],['trailLength','Tail length',.2,4,.1,' s'],['cometSize','Comet head size',1,12,.5,' px']]},
  {name:'Floating background particles',panel:'scene',open:true,items:[['bgDust','Particle count',0,400,1,''],['dustShape','Shape','select',[['dots','Soft dots'],['bokeh','Bokeh'],['rings','Rings'],['stars','Four-point stars'],['diamonds','Diamonds'],['streaks','Streaks']]],['dustColorMode','Colors','select',[['palette','Current palette'],['single','Custom color'],['rainbow','Rainbow']]],['dustColor','Custom particle color','color'],['dustSize','Size',1,18,.5,' px'],['dustVariation','Size variation',0,.8,.05,'%'],['dustOpacity','Opacity',.05,1,.01,'%'],['dustGlow','Glow',0,30,1,' px'],['dustBlend','Blend','select',[['screen','Screen'],['lighter','Additive glow'],['source-over','Normal']]],['dustTwinkle','Twinkle',0,1,.05,'%']]},
  {name:'Particle motion & beat sync',panel:'scene',open:true,items:[['dustMotion','Movement','select',[['drift','Directional drift'],['swirl','Swirl'],['radial','Radiate outward']]],['dustSpeed','Speed',0,3,.05,'×'],['dustDirection','Direction · 0° right / 90° down',0,360,5,'°'],['dustClockwise','Clockwise swirl','toggle'],['dustWander','Wandering',0,1,.05,'%'],['dustBeat','Pulse to MIDI beats','toggle'],['dustBeatStrength','Beat response',0,1.5,.05,'×'],['dustBeatDivision','Pulses per beat',.5,4,.5,''],['dustBeatDecay','Pulse decay',2,16,1,''],['dustSeed','Pattern seed',1,999,1,'']]},
  {name:'Stage & guides',items:[['background','Background','color'],['ambient','Ambient light','toggle'],['ambientStrength','Ambient strength',0,.5,.01,'%'],['grid','Pitch grid','toggle'],['gridOpacity','Grid opacity',0,.5,.01,'%'],['beatLines','Beat lines','toggle'],['octaveLines','Octave guides','toggle'],['playhead','Playhead line','toggle'],['playheadColor','Playhead color','color'],['playheadWidth','Playhead width',.5,4,.5,' px'],['horizontalHead','Horizontal playhead',.06,.45,.01,'%'],['saturation','Color saturation',0,150,1,'%raw']]},
  {name:'Keyboard & pitch',items:[['keyboard','Show keyboard','toggle'],['keyboardHeight','Keyboard size',30,120,2,' px'],['keyLabels','Keyboard labels','toggle'],['pitchRange','Pitch range','select',[['auto','Fit the song'],['full','Full piano · 88 keys'],['custom','Custom range']]],['minPitch','Lowest MIDI note',0,126,1,''],['maxPitch','Highest MIDI note',1,127,1,'']]},
  {name:'Sound',items:[['transpose','Transpose',-24,24,1,' st'],['brightness','Tone brightness',0,1,.01,'%'],['space','Echo ambience',0,1,.01,'%']]},
  {name:'Video overlays',items:[['showTitle','Show song title','toggle'],['titleSize','Title size',14,56,1,' px'],['showTime','Show playback time','toggle']]}
];
const controlItems=new Map(originalGroups.flatMap(group=>group.items).map(item=>[item[0],item]));
for(const item of [['notesEnabled','Notes','toggle'],['dustEnabled','Floating particles','toggle'],['imageEnabled','Background image','toggle'],['dustFlutter','Flutter amount',0,2,.05,'×'],['dustSpin','Tumbling speed',0,3,.05,'×']])controlItems.set(item[0],item);
controlItems.get('dustShape')[3].push(['fire','Fire flakes'],['petals','Cherry petals']);
controlItems.get('dustColorMode')[3].push(['fire','Fire colors'],['cherry','Cherry blossom colors']);
const defineGroup=(name,panel,keys,extra={})=>({name,panel,items:keys.split(' ').map(key=>controlItems.get(key)),...extra});
const groups=[
 defineGroup('Show / hide','visual','notesEnabled keyboard keyLabels noteLabels grid octaveLines beatLines playhead particles dustEnabled imageEnabled ambient showTitle showTime',{id:'visibility',open:true}),
 defineGroup('Notes & colors','visual','timeWindow noteWidth roundness opacity velocitySize gradient colorMode saturation zoom',{id:'notes'}),
 defineGroup('Glow & highlights','visual','glow glowStrength sustainGlow',{id:'glow'}),
 defineGroup('Note-hit particles','visual','particleCount particleVelocity particleMotion particleShape particleSize particleSpread particleLife',{id:'hit-particles'}),
 defineGroup('Keyboard & pitch range','visual','keyboardHeight pitchRange minPitch maxPitch',{id:'keyboard'}),
 defineGroup('Grid & playhead appearance','visual','gridOpacity playheadColor playheadWidth horizontalHead',{id:'guides'}),
 defineGroup('Title appearance','visual','titleSize',{id:'titles'}),
 defineGroup('Comet style','visual','trails trailLength cometSize',{id:'comet',mode:'comet'}),
 defineGroup('Orbit style','visual','orbitRadius',{id:'orbit',mode:'orbit'}),
 defineGroup('Pulse bars style','visual','pulseHeight',{id:'pulse',mode:'pulse'}),
 defineGroup('Ribbon flow style','visual','ribbonWave',{id:'ribbon',mode:'ribbon'}),
 defineGroup('Spiral galaxy style','visual','spiralTurns creativeRotation',{id:'spiral',mode:'spiral'}),
 defineGroup('Neon tunnel style','visual','tunnelDepth',{id:'tunnel',mode:'tunnel'}),
 defineGroup('Ripple field style','visual','rippleSize rippleLife',{id:'ripples',mode:'ripples'}),
 defineGroup('Background & ambient light','scene','background ambientStrength',{id:'backdrop',target:'image-controls'}),
 defineGroup('Image motion','scene','bgMotion bgMovement bgSpeed bgPulse',{id:'image-motion',target:'image-controls'}),
 defineGroup('Image color & finishing','scene','bgBlur bgBrightness bgSaturation bgOpacity bgDim bgVignette bgTint bgTintAmount',{id:'image-color',target:'image-controls'}),
 defineGroup('Particle appearance','scene','bgDust dustShape dustColorMode dustColor dustSize dustVariation dustOpacity dustGlow dustBlend dustTwinkle',{id:'atmosphere',open:true}),
 defineGroup('Particle movement','scene','dustMotion dustSpeed dustDirection dustClockwise dustWander dustFlutter dustSpin dustSeed',{id:'particle-motion'}),
 defineGroup('Particle beat sync','scene','dustBeat dustBeatStrength dustBeatDivision dustBeatDecay',{id:'particle-beat'}),
 defineGroup('MIDI synth sound','tracks','transpose brightness space',{id:'sound'})
];
const synth=new Synth();let song,tracks=new Map(),title='First Light',isDemo=true,playing=false,position=0,anchorPos=0,anchorTime=0,speed=1,nextNote=0,loop=false,loopA=0,loopB=41,recording=false,recorder=null,recordStop=0,recordStart=0,cancelled=false,playRequest=0,recordChunks=[],captureStream=null,recordMime='',exportSize=null,installPrompt=null,toastTimer=0,dragDepth=0;
const external={buffer:null,name:'',mode:'synth',offset:0,rate:1,gain:1,peaks:null};let externalVoice=null,assetBusy=false;
let midiSources=[];
let backgroundImage=null,backgroundName='',pendingSceneAudio=null,pendingSceneTracks=null,pendingScenePlayback=null;
let directExport=false,exportAbort=null,lastExport=null;
async function releaseExport(){if(!lastExport)return;const old=lastExport;lastExport=null;URL.revokeObjectURL(old.url);await old.cleanup();$('download-mp4').hidden=true;}
window.addEventListener('pagehide',()=>{releaseExport().catch(()=>{});});
const canvas=$('canvas'),ctx=canvas.getContext('2d',{alpha:true});
const fmt=s=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const noteName=p=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((p%12)+12)%12]+(Math.floor(p/12)-1);
const rgba=(hex,a)=>{const h=hex.replace('#','');return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${clamp(a,0,1)})`;};
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
function persist(){try{localStorage.setItem('prism-settings',JSON.stringify(settings));}catch{}}
function displayValue(item,value){return item[5]==='%'?`${Math.round(value*100)}%`:item[5]==='%raw'?`${value}%`:`${Number(value.toFixed(2))}${item[5]||''}`;}
function buildControls(){
  $('visibility-controls').replaceChildren();$('visual-controls').replaceChildren();$('scene-controls').replaceChildren();$('image-controls').replaceChildren();$('sound-controls').replaceChildren();
  for(const group of groups){const details=document.createElement('details');details.id=`group-${group.id}`;details.dataset.styleMode=group.mode||'';details.open=!!group.open;details.classList.toggle('visibility-group',group.id==='visibility');const summary=document.createElement('summary');summary.textContent=group.name;details.append(summary);
    for(const item of group.items){const [key,name,type]=item;const label=document.createElement('label');let input;
      if(type==='toggle'){label.className='toggle-row';const span=document.createElement('span');span.textContent=name;input=document.createElement('input');input.type='checkbox';input.checked=settings[key];label.append(span,input);}
      else if(type==='color'){label.className='toggle-row';const span=document.createElement('span');span.textContent=name;input=document.createElement('input');input.type='color';input.className='color-input';input.value=settings[key];label.append(span,input);}
      else{label.className='control';label.style.display='block';const top=document.createElement('span');top.className='control-top';const text=document.createElement('span');text.textContent=name;top.append(text);label.append(top);
        if(type==='select'){if(!item[3].some(([value])=>value===settings[key]))settings[key]=defaults[key];input=document.createElement('select');for(const [value,text]of item[3]){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}input.value=settings[key];}
        else{settings[key]=Number.isFinite(settings[key])?clamp(settings[key],item[2],item[3]):defaults[key];input=document.createElement('input');input.type='range';input.min=item[2];input.max=item[3];input.step=item[4];input.value=settings[key];const output=document.createElement('output');output.id=`value-${key}`;output.textContent=displayValue(item,settings[key]);top.append(output);}
        label.append(input);
      }
      input.id=`setting-${key}`;input.setAttribute('aria-label',name);input.addEventListener('input',()=>{const val=type==='toggle'?input.checked:typeof type==='number'?Number(input.value):input.value;settings[key]=val;const out=$(`value-${key}`);if(out)out.textContent=displayValue(item,val);if(key==='transpose')reschedule();if(key==='space')synth.setSpace(val);persist();});details.append(label);
    }$(group.id==='visibility'?'visibility-controls':group.target||(group.panel==='scene'?'scene-controls':group.panel==='tracks'?'sound-controls':'visual-controls')).append(details);
  }
  $('preset').value=settings.preset;syncPalette();setMode(settings.mode);
}
function syncPalette(){const p=palettes[settings.preset];$$('#palette-preview i').forEach((el,i)=>el.style.background=p[i]);$('custom-palette').hidden=settings.preset!=='custom';$$('#custom-palette input').forEach((el,i)=>el.value=palettes.custom[i]);}
function setMode(mode){if(recording)return;settings.mode=mode;$$('[data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',on);});$('mode-label').textContent=modeNames[mode];for(const group of groups)if(group.mode){const el=$(`group-${group.id}`);if(el)el.hidden=group.mode!==mode;}persist();}
function settingsSearch(){
 const query=$('settings-search').value.trim().toLowerCase(),results=$('settings-results');results.replaceChildren();results.hidden=!query;if(!query)return;
 const tokens=query.split(/\s+/).map(t=>t==='keywords'?'keyboard':t.replace(/s$/,''));let found=0;
 for(const group of groups)for(const [key,name] of group.items){
  const haystack=`${group.name} ${name} ${key} ${key==='keyboard'?'piano keys':''}`.toLowerCase();if(!tokens.every(t=>haystack.includes(t)))continue;
  if(found++>=30)continue;const button=document.createElement('button');button.type='button';button.className='settings-result';button.textContent=`${name} · ${group.panel==='visual'?'Visuals':group.panel==='scene'?'Scene':'Tracks'} / ${group.name}`;
  button.addEventListener('click',()=>{if(recording)return;showPanel(group.panel);if(group.mode)setMode(group.mode);const section=$(`group-${group.id}`);section.open=true;$('settings-search').value='';results.hidden=true;const input=$(`setting-${key}`);input.focus();input.scrollIntoView({block:'center',behavior:'smooth'});});results.append(button);
 }
 if(!found){const p=document.createElement('p');p.textContent='No settings found. Try keyboard, grid, glow, or particles.';results.append(p);}
}
$('settings-search').addEventListener('input',settingsSearch);
$('hide-guides').addEventListener('click',()=>{if(recording)return;for(const key of ['grid','octaveLines','beatLines','playhead','keyLabels','noteLabels','showTitle','showTime'])settings[key]=false;buildControls();persist();toast('Guides and labels hidden.');});
function showPanel(name){$$('[data-panel]').forEach(b=>{const on=b.dataset.panel===name;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;$(`panel-${b.dataset.panel}`).hidden=!on;});}
function loadSong(data,name,demo=false){
  pause();song=data;title=name;isDemo=demo;if(demo)midiSources=[];tracks=new Map();data.tracks.forEach((t,i)=>tracks.set(t.id,{...t,color:palettes[settings.preset][i%6],visible:true,mute:false,solo:false,volume:1,pan:0,instrument:'auto'}));
  song.beats=[];
  for(let i=0;i<song.tempoMap.length;i++){const seg=song.tempoMap[i],end=song.tempoMap[i+1]?.seconds??song.duration,quarter=seg.mpqn/1e6,first=seg.tick/(song.ppq||480);for(let b=Math.ceil(first);song.beats.length<200000;b++){const time=seg.seconds+(b-first)*quarter;if(time>=end)break;song.beats.push({time,bar:b%4===0});}}
  song.maxDuration=song.notes.reduce((m,n)=>Math.max(m,n.duration),0);position=0;loop=false;loopA=0;loopB=song.duration;nextNote=0;
  $('song-title').textContent=title;$('song-info').textContent=`${demo?'Demo composition':`${data.sources?.length||1} MIDI file${data.sources?.length>1?'s':''}`} · ${tracks.size} ${tracks.size===1?'track':'tracks'} · ${song.bpm} BPM${song.tempoMap.length>1?' · variable tempo':''}`;
  $('demo-badge').hidden=!demo;$('track-count').textContent=tracks.size;$('seek').max=song.duration;$('duration').textContent=fmt(song.duration);$('loop-start').max=Math.max(0,song.duration-.1);$('loop-end').max=song.duration;$('loop-end').value=song.duration.toFixed(1);$('loop-start').value='0';$('loop-toggle').setAttribute('aria-pressed','false');$('loop-controls').hidden=true;if(pendingSceneTracks)restoreTrackSettings(pendingSceneTracks);if(pendingScenePlayback?.title===title){restorePlayback(pendingScenePlayback.settings);pendingScenePlayback=null;}buildTracks();updateTimeline();drawAudioWaveform();updateMidiStatus();
}
function buildTracks(){
  const list=$('track-list');list.replaceChildren();const containers=new Map();
  if((song.sources?.length||0)>1)for(const source of song.sources){const group=document.createElement('details');group.className='midi-track-group';const summary=document.createElement('summary');const count=[...tracks.values()].filter(t=>t.sourceId===source.id).length;summary.textContent=`${source.label} · ${count} ${count===1?'track':'tracks'}`;summary.title=source.name;group.append(summary);list.append(group);containers.set(source.id,group);}
  for(const track of tracks.values()){
    const card=document.createElement('div');card.className='track-card';const name=document.createElement('div');name.className='track-name';const color=document.createElement('input');color.type='color';color.value=track.color;color.className='color-input';color.setAttribute('aria-label',`${track.name} color`);color.addEventListener('input',()=>track.color=color.value);const strong=document.createElement('strong');strong.textContent=track.name;strong.title=track.name;name.append(color,strong);const meta=document.createElement('div');meta.className='track-meta';meta.textContent=`${track.count.toLocaleString()} notes · Channel ${track.channel+1}`;meta.title=track.sourceName||track.name;
    const actions=document.createElement('div');actions.className='track-actions';for(const [key,label]of [['mute','Mute'],['solo','Solo'],['visible','Visible']]){const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-pressed',track[key]);button.setAttribute('aria-label',`${label}: ${track.name}`);button.addEventListener('click',()=>{track[key]=!track[key];button.setAttribute('aria-pressed',track[key]);if(key!=='visible')reschedule();});actions.append(button);}
    const instrumentLabel=document.createElement('label');instrumentLabel.className='field';instrumentLabel.textContent='Synth voice';const select=document.createElement('select');const option=document.createElement('option');option.value='auto';option.textContent=track.channel===9?'MIDI percussion':`MIDI · ${GM_NAMES[track.program]}`;select.append(option);
    if(track.channel!==9)for(const [value,label]of [[0,'Piano'],[10,'Music box'],[11,'Vibraphone'],[16,'Organ'],[24,'Guitar'],[32,'Bass'],[48,'Strings'],[73,'Flute'],[80,'Square lead'],[81,'Saw lead'],[88,'Soft pad']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=track.instrument;select.disabled=track.channel===9;select.addEventListener('change',()=>{track.instrument=select.value;reschedule();});instrumentLabel.append(select);card.append(name,meta,actions,instrumentLabel);
    for(const [key,label,min,max]of [['volume','Volume',0,1.5],['pan','Pan',-1,1]]){const wrap=document.createElement('label');wrap.className='control';wrap.style.display='block';const top=document.createElement('span');top.className='control-top';const span=document.createElement('span');span.textContent=label;const out=document.createElement('output');out.textContent=key==='volume'?`${Math.round(track[key]*100)}%`:Math.abs(track[key])<.03?'Center':`${Math.round(Math.abs(track[key])*100)}% ${track[key]<0?'L':'R'}`;top.append(span,out);const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=.01;input.value=track[key];input.setAttribute('aria-label',`${track.name} ${label.toLowerCase()}`);input.addEventListener('input',()=>{track[key]=Number(input.value);out.textContent=key==='volume'?`${Math.round(track[key]*100)}%`:Math.abs(track[key])<.03?'Center':`${Math.round(Math.abs(track[key])*100)}% ${track[key]<0?'L':'R'}`;});wrap.append(top,input);card.append(wrap);}(containers.get(track.sourceId)||list).append(card);
  }
}
function lowerBound(time){let a=0,b=song.notes.length;while(a<b){const m=(a+b)>>1;if(song.notes[m].start<time)a=m+1;else b=m;}return a;}
function now(){return playing?anchorPos+(synth.ctx.currentTime-anchorTime)*speed:position;}
function useSynth(){return !external.buffer||external.mode!=='file';}
function stopExternal(){externalVoice?.stop();externalVoice=null;}
function startExternal(){stopExternal();if(external.buffer&&external.mode!=='synth')externalVoice=scheduleAudioBuffer(synth.ctx,external.buffer,external,anchorPos,recording?recordStop:loop?loopB:song.duration,speed,synth.master,anchorTime);}
function canHear(track){return useSynth()&&!track.mute&&(![...tracks.values()].some(t=>t.solo)||track.solo);}
function scheduleHeld(t){const start=lowerBound(t-song.maxDuration);for(let i=start;i<song.notes.length&&song.notes[i].start<t;i++){const n=song.notes[i],tr=tracks.get(n.trackId);if(n.end>t&&canHear(tr))synth.play(n,tr,synth.ctx.currentTime,(n.end-t)/speed,settings.transpose,settings.brightness);}}
async function play(){if(playing||!song)return;const request=++playRequest;try{await synth.init();if(request!==playRequest)return;synth.setVolume(Number($('volume').value));synth.setSpace(settings.space);if(position>=song.duration-.01)position=0;if(loop&&(position<loopA||position>=loopB))position=loopA;anchorPos=position;anchorTime=synth.ctx.currentTime;nextNote=lowerBound(position);scheduleHeld(position);startExternal();playing=true;updatePlay();schedule();}catch(e){toast(e.message);}}
function pause(){playRequest++;if(playing)position=clamp(now(),0,song.duration);playing=false;stopExternal();synth.stop();updatePlay();}
function seek(time){const was=playing;pause();position=clamp(time,0,song.duration);updateTimeline();if(was)play();}
function reschedule(){if(!playing)return;position=now();synth.stop();anchorPos=position;anchorTime=synth.ctx.currentTime;nextNote=lowerBound(position);scheduleHeld(position);startExternal();}
function updatePlay(){$('play').textContent=playing?'Ⅱ':'▶';$('play').classList.toggle('playing',playing);$('play').setAttribute('aria-label',playing?'Pause':'Play');}
function schedule(){if(!playing||!song)return;const t=now();const stop=recording?recordStop:loop?loopB:song.duration;
  if(t>=stop){if(recording){finishRecording(false);return;}if(loop){seek(loopA);return;}pause();position=song.duration;updateTimeline();return;}
  const horizon=Math.min(t+.14*speed,stop),solo=[...tracks.values()].some(tr=>tr.solo);
  while(nextNote<song.notes.length&&song.notes[nextNote].start<horizon){const n=song.notes[nextNote++],tr=tracks.get(n.trackId);if(!useSynth()||n.end<t||tr.mute||(solo&&!tr.solo))continue;
    const start=Math.max(t,n.start),when=anchorTime+(start-anchorPos)/speed,duration=(Math.min(n.end,stop)-start)/speed;if(duration>0)synth.play(n,tr,when,duration,settings.transpose,settings.brightness);
  }
}
setInterval(schedule,25);
function updateTimeline(){if(directExport)return;const t=clamp(now(),0,song?.duration||0);$('current-time').textContent=fmt(t);$('seek').value=t;if(external.buffer)$('audio-cursor').style.left=`${100*t/(song?.duration||1)}%`;$('seek').style.setProperty('--progress',`${100*t/(song?.duration||1)}%`);if(recording&&!directExport)$('record-label').textContent=`Recording ${Math.round(100*clamp((t-recordStart)/(recordStop-recordStart),0,1))}% · ${fmt((recordStop-t)/speed)} left`;}
function pitchRange(){let min,max;if(settings.pitchRange==='full'){min=21;max=108;}else if(settings.pitchRange==='custom'){min=Math.min(settings.minPitch,settings.maxPitch-1);max=Math.max(settings.maxPitch,min+1);}else{min=Math.max(0,song.min+settings.transpose-3);max=Math.min(127,song.max+settings.transpose+3);}
  const center=(min+max)/2,half=Math.max(6,(max-min)/2/settings.zoom);return [Math.max(0,Math.floor(center-half)),Math.min(127,Math.ceil(center+half))];}
const isBlack=n=>[1,3,6,8,10].includes((n%12+12)%12);
function noteColor(n,tr){if(settings.colorMode==='pitch')return `hsl(${(n.pitch%12)*30},${settings.saturation}%,70%)`;if(settings.colorMode==='velocity')return `hsl(${270-n.velocity*230},${settings.saturation}%,70%)`;return tr.color;}
function alphaColor(color,opacity){if(color.startsWith('#'))return rgba(color,opacity);return color.replace('hsl(','hsla(').replace(')',`,${clamp(opacity,0,1)})`);}
function rounded(x,y,w,h,r){if(w<=0||h<=0)return;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));else ctx.rect(x,y,w,h);ctx.fill();}
function render(){requestAnimationFrame(render);if(!directExport)drawFrame();}
function drawFrame(time=now()){if(!song)return;
  const box=exportSize||canvas.getBoundingClientRect(),ratio=exportSize?1:Math.min(window.devicePixelRatio||1,2),width=exportSize?.width||Math.max(1,Math.round(box.width*ratio)),height=exportSize?.height||Math.max(1,Math.round(box.height*ratio));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const w=width/ratio,h=height/ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.filter='none';ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,w,h);const transparent=$('export-transparent').checked;if(!transparent){ctx.fillStyle=settings.background;ctx.fillRect(0,0,w,h);}
  const t=clamp(time,0,song.duration),[min,max]=pitchRange(),count=max-min+1,vertical=settings.mode==='vertical',comet=settings.mode==='comet',keySize=settings.keyboard?settings.keyboardHeight:0;
  const baseline=h-keySize-18,headX=keySize+(w-keySize)*settings.horizontalHead,scale=vertical?baseline/settings.timeWindow:(w-headX)/settings.timeWindow;
  const whites=[];for(let p=min;p<=max;p++)if(!isBlack(p))whites.push(p);const keyW=w/Math.max(whites.length,1),keyMap=new Map();let whiteIndex=0;
  for(let p=min;p<=max;p++){if(!isBlack(p)){keyMap.set(p,{x:whiteIndex*keyW,w:keyW});whiteIndex++;}else keyMap.set(p,{x:whiteIndex*keyW-keyW*.3,w:keyW*.6});}
  const rowH=(h-28)/count,pitchY=p=>14+(max-p+.5)*rowH;
  const budget={left:6000},visibleNotes=settings.notesEnabled?song.notes.slice(lowerBound(t-song.maxDuration-4),lowerBound(t+settings.timeWindow+1)):[];
  if(!transparent&&settings.imageEnabled)drawBackground(ctx,backgroundImage,w,h,t,settings,palettes[settings.preset][0],midiEnergy(visibleNotes,t,tracks));
  if(!transparent&&settings.ambient){const g=ctx.createRadialGradient(w*.55,h*.64,0,w*.5,h*.5,Math.max(w,h)*.65);g.addColorStop(0,rgba(palettes[settings.preset][0],settings.ambientStrength));g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
  drawAtmosphere(ctx,w,h,t,settings,palettes[settings.preset],song);
  if(settings.mode==='orbit'||settings.mode==='pulse'){drawExtraScene(ctx,{mode:settings.mode,w,h,t,s:settings,notes:visibleNotes,tracks,min,max,colorFor:noteColor,noteName,budget});drawOverlays(w,h,t);updateTimeline();return;}
  if(['spiral','tunnel','ripples'].includes(settings.mode)){drawCreativeScene(ctx,{mode:settings.mode,w,h,t,s:settings,notes:visibleNotes,tracks,min,max,colorFor:noteColor,noteName,budget});drawOverlays(w,h,t);updateTimeline();return;}
  ctx.lineWidth=1;ctx.strokeStyle=`rgba(139,161,204,${settings.gridOpacity})`;
  if(settings.grid){for(let p=min;p<=max;p++){ctx.beginPath();if(vertical){const k=keyMap.get(p);if(isBlack(p))continue;ctx.moveTo(k.x,0);ctx.lineTo(k.x,baseline);}else{ctx.moveTo(keySize,pitchY(p)+rowH/2);ctx.lineTo(w,pitchY(p)+rowH/2);}ctx.stroke();}}
  if(settings.octaveLines){ctx.strokeStyle=`rgba(171,181,218,${settings.gridOpacity*1.7})`;for(let p=min;p<=max;p++)if(p%12===0){ctx.beginPath();if(vertical){ctx.moveTo(keyMap.get(p).x,0);ctx.lineTo(keyMap.get(p).x,baseline);}else{ctx.moveTo(keySize,pitchY(p));ctx.lineTo(w,pitchY(p));}ctx.stroke();}}
  if(settings.beatLines){ctx.strokeStyle=`rgba(133,152,191,${settings.gridOpacity*.8})`;let lo=0,hi=song.beats.length;while(lo<hi){const mid=(lo+hi)>>1;if(song.beats[mid].time<t-headX/scale)lo=mid+1;else hi=mid;}for(let bi=lo;bi<song.beats.length;bi++){const beat=song.beats[bi];if(beat.time>t+settings.timeWindow+1)break;const pos=vertical?baseline-(beat.time-t)*scale:headX+(beat.time-t)*scale;ctx.beginPath();if(vertical){if(pos<0||pos>baseline)continue;ctx.moveTo(0,pos);ctx.lineTo(w,pos);}else{if(pos<keySize||pos>w)continue;ctx.moveTo(pos,0);ctx.lineTo(pos,h);}ctx.globalAlpha=beat.bar?1:.45;ctx.stroke();}ctx.globalAlpha=1;}
  const active=new Map(),startIndex=lowerBound(t-song.maxDuration-settings.trailLength-2);let drawn=0;
  ctx.save();ctx.beginPath();ctx.rect(vertical?0:keySize,0,vertical?w:w-keySize,vertical?baseline:h);ctx.clip();if(settings.colorMode==='track'&&settings.saturation!==100)ctx.filter=`saturate(${settings.saturation}%)`;
  for(let i=startIndex;settings.notesEnabled&&i<song.notes.length;i++){const n=song.notes[i];if(n.start>t+settings.timeWindow+1)break;const tr=tracks.get(n.trackId);if(!tr.visible)continue;const p=n.pitch+(n.channel===9?0:settings.transpose);if(p<min||p>max)continue;const age=t-n.start,endAge=t-n.end,held=age>=0&&endAge<0;if(held)active.set(p,noteColor(n,tr));
    if(endAge>Math.max(2,settings.trailLength)||++drawn>16000)continue;
    const color=noteColor(n,tr),size=settings.noteWidth*(settings.velocitySize?.5+n.velocity*.5:1),opacity=settings.opacity*(held?1:.75),glow=held?settings.glow:settings.glow*.3;
    ctx.shadowColor=alphaColor(color,settings.glowStrength);ctx.shadowBlur=glow;
    let x,y,nw,nh;
    if(vertical){const k=keyMap.get(p);nw=k.w*size;x=k.x+(k.w-nw)/2;nh=Math.max(3,n.duration*scale);y=baseline-(n.end-t)*scale;}
    else{x=headX+(n.start-t)*scale;y=pitchY(p)-rowH*size/2;nw=Math.max(3,n.duration*scale);nh=Math.max(2,rowH*size);}
    if(comet){const cx=held?headX:x,cy=pitchY(p),r=Math.min(rowH*.65,settings.cometSize*(.5+n.velocity*.5)),length=Math.max(5,Math.min(n.duration,settings.trailLength)*scale);
      if(settings.trails){const g=ctx.createLinearGradient(cx,cy,cx+length,cy);g.addColorStop(0,alphaColor(color,opacity));g.addColorStop(1,alphaColor(color,0));ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(cx,cy-r);ctx.quadraticCurveTo(cx+length*.5,cy-r*.2,cx+length,cy);ctx.quadraticCurveTo(cx+length*.5,cy+r*.2,cx,cy+r);ctx.closePath();ctx.fill();}
      ctx.fillStyle=alphaColor(color,opacity);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();if(held){ctx.fillStyle='#f6f2ff';ctx.beginPath();ctx.arc(cx,cy,r*.38,0,Math.PI*2);ctx.fill();}
    }else if(settings.mode==='ribbon'){
      const left=Math.max(keySize,x),right=Math.min(w,x+nw);ctx.strokeStyle=alphaColor(color,opacity);ctx.lineWidth=Math.max(2,nh*.65);ctx.lineCap='round';ctx.beginPath();
      for(let rx=left;rx<=right;rx+=4){const ry=y+nh/2+Math.sin((rx-headX)/85)*Math.sin(t*.65+p*.7)*settings.ribbonWave;if(rx===left)ctx.moveTo(rx,ry);else ctx.lineTo(rx,ry);}ctx.stroke();ctx.lineCap='butt';
    }else{if(settings.gradient){const g=vertical?ctx.createLinearGradient(x,y,x,y+nh):ctx.createLinearGradient(x,y,x+nw,y);g.addColorStop(0,alphaColor(color,opacity*.38));g.addColorStop(1,alphaColor(color,opacity));ctx.fillStyle=g;}else ctx.fillStyle=alphaColor(color,opacity);rounded(x,y,nw,nh,settings.roundness);
      if(held&&settings.sustainGlow){ctx.fillStyle=alphaColor('#ffffff',.38);if(vertical)rounded(x,baseline-3,nw,3,1);else rounded(headX,y,3,nh,1);}
      if(settings.noteLabels&&((vertical&&nw>15&&nh>23)||(!vertical&&nw>26&&nh>11))){ctx.shadowBlur=0;ctx.font=`${Math.min(12,vertical?nw*.55:nh*.75)}px system-ui`;ctx.fillStyle='#f5f3ff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(noteName(p),vertical?x+nw/2:x+Math.min(nw/2,30),vertical?Math.max(y+12,12):y+nh/2);}
    }
    const hit=vertical?keyMap.get(p):null;drawParticles(ctx,n,t,vertical?hit.x+hit.w/2:headX,vertical?baseline:pitchY(p),vertical?-Math.PI/2:0,color,settings,budget);
  }
  ctx.restore();ctx.shadowBlur=0;ctx.filter='none';
  if(settings.playhead){ctx.strokeStyle=settings.playheadColor;ctx.lineWidth=settings.playheadWidth;ctx.shadowColor=settings.playheadColor;ctx.shadowBlur=settings.glow*.5;ctx.beginPath();if(vertical){ctx.moveTo(0,baseline);ctx.lineTo(w,baseline);}else{ctx.moveTo(headX,0);ctx.lineTo(headX,h);}ctx.stroke();ctx.shadowBlur=0;}
  if(settings.keyboard){if(vertical){ctx.fillStyle='#111623';ctx.fillRect(0,baseline+1,w,keySize+20);for(const black of [false,true])for(let p=min;p<=max;p++){if(isBlack(p)!==black)continue;const k=keyMap.get(p),held=active.get(p),kh=black?keySize*.61:keySize;ctx.fillStyle=held?held:black?'#101520':'#a1aec8';if(held){ctx.shadowColor=held;ctx.shadowBlur=settings.glow*.6;}rounded(k.x+(black?0:1),baseline+5,Math.max(1,k.w-(black?0:2)),kh,2);ctx.shadowBlur=0;if(settings.keyLabels&&!black&&p%12===0){ctx.fillStyle=held?'#222139':'#37445c';ctx.font=`${clamp(k.w*.55,8,12)}px system-ui`;ctx.textAlign='center';ctx.fillText(noteName(p),k.x+k.w/2,baseline+keySize-5);}}}
    else{ctx.fillStyle='#111724';ctx.fillRect(0,0,keySize,h);for(let p=min;p<=max;p++){const held=active.get(p);ctx.fillStyle=held|| (isBlack(p)?'#171e30':'#71809b');ctx.fillRect(0,pitchY(p)-rowH/2,isBlack(p)?keySize*.66:keySize-2,Math.max(1,rowH-1));if(settings.keyLabels&&p%12===0){ctx.fillStyle=held?'#14192b':'#dde4f3';ctx.font='10px system-ui';ctx.textAlign='left';ctx.fillText(noteName(p),5,pitchY(p)+3);}}}}
  drawOverlays(w,h,t);updateTimeline();
}
function drawOverlays(w,h,t){
  if(settings.showTitle){ctx.fillStyle='#e6e8f4';ctx.font=`500 ${settings.titleSize}px system-ui`;ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(title,24,23,w-48);}if(settings.showTime){ctx.fillStyle='#9daac5';ctx.font='14px ui-monospace,monospace';ctx.textAlign='right';ctx.textBaseline='top';ctx.fillText(`${fmt(t)} / ${fmt(song.duration)}`,w-24,25);}
  if(directExport)return;
  if(!settings.showTitle){$('stage-note').hidden=settings.showTime;}$('stage-label').hidden=settings.showTitle||recording;
}
function updateMidiStatus(message){
 const count=song.sources?.length||0;
 $('midi-import-status').textContent=message||(count?`${count} MIDI file${count===1?'':'s'} loaded. Each file keeps its original timing, including leading silence.`:'Select separate instrument MIDIs together, or add them one batch at a time.');
 $('midi-timing-note').hidden=!song.tempoMismatch;
 $('midi-timing-note').textContent=song.tempoMismatch?`These files have different tempo maps. Notes keep each file’s original timing; beat guides use ${song.tempoSource}. For aligned parts, export them from the same song start and tempo map.`:'';
}
async function openFiles(files,append=false){
 if(!files?.length||recording||assetBusy)return;
 mediaLoading(true);
 try{
  const result=await importMidiFiles(files,append&&!isDemo?midiSources:[],message=>updateMidiStatus(message));
  if(append&&!isDemo&&result.sources.length===midiSources.length){updateMidiStatus('These MIDI files are already loaded; no duplicate tracks were added.');return;}
  const previous=append&&!isDemo?{tracks:captureScene().tracks,position:now(),playback:captureScene().playback}:null;
  midiSources=result.sources;loadSong(result.song,result.title);
  if(previous){restoreTrackSettings(previous.tracks);restorePlayback({...previous.playback,loopEnd:previous.playback.loop?previous.playback.loopEnd:song.duration});position=clamp(previous.position,0,song.duration);buildTracks();updateTimeline();}
  showPanel('tracks');toast(`Loaded ${result.sources.length} MIDI files · ${result.song.tracks.length} tracks · ${result.song.notes.length.toLocaleString()} notes.${result.skipped?' Duplicate files skipped.':''}`);
 }catch(error){updateMidiStatus(error.message||'Could not read these MIDI files.');toast(error.message||'Could not read these MIDI files.');}
 finally{mediaLoading(false);$('file-input').value='';$('add-midi-input').value='';}
}
function validLoop(){loopA=clamp(Number($('loop-start').value)||0,0,Math.max(0,song.duration-.1));loopB=clamp(Number($('loop-end').value)||song.duration,loopA+.1,song.duration);$('loop-start').value=loopA.toFixed(1);$('loop-end').value=loopB.toFixed(1);if(loop&&playing&&(now()<loopA||now()>=loopB))seek(loopA);}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function safeName(){return title.replace(/[^a-zA-Z0-9 _-]/g,'').trim().replace(/\s+/g,'-').slice(0,80)||'prism';}
function recordUI(on){recording=on;document.body.classList.toggle('recording',on);$('record-overlay').hidden=!on;for(const id of ['open-file','load-demo','reset','play','restart','seek','speed','loop-toggle','loop-start','loop-end','loop-set-start','loop-set-end','record','record-test','fast-export','record-live','resolution','resolution-width','resolution-height','export-transparent','transparent-format','aspect','aspect-width','aspect-height','fps','bitrate','export-range','export-audio','snapshot'])$(id).disabled=on;for(const el of $$('#panel-visual input,#panel-visual select,#panel-visual button,#panel-scene input,#panel-scene select,#panel-scene button,#panel-tracks input,#panel-tracks select,#panel-tracks button,[data-mode],#preset,#volume')){if(on){el.dataset.exportDisabled=String(el.disabled);el.disabled=true;}else{el.disabled=el.dataset.exportDisabled==='true';delete el.dataset.exportDisabled;}}}
async function startDirectExport(testOnly=false){
  if(recording||assetBusy){if(assetBusy)toast('Wait for your media to finish loading.');return;}
  const oldPosition=now();pause();validLoop();
  let size;try{size=getFrameSize();}catch(error){toast(error.message);return;}
  const rangeStart=$('export-range').value==='loop'?loopA:0,rangeEnd=$('export-range').value==='loop'?loopB:song.duration;
  const start=testOnly?clamp(oldPosition,rangeStart,Math.max(rangeStart,rangeEnd-3*speed)):rangeStart,end=testOnly?Math.min(rangeEnd,start+3*speed):rangeEnd;
  const transparent=$('export-transparent').checked,transparentFormat=$('transparent-format').value,prores=transparent&&transparentFormat==='prores',png=transparent&&transparentFormat==='png',label=png?'PNG MOV':prores?'ProRes MOV':transparent?'WebM':'MP4',extension=png||prores?'mov':transparent?'webm':'mp4';
  const filename=`${safeName()}-prism${testOnly?'-test':''}.${extension}`;
  directExport=true;exportAbort=new AbortController();recordUI(true);$('record-label').textContent=`Checking ${label} support…`;
  try{
    $('export-result').textContent='';
    const fileHandle=await pickExportFile(filename,transparent,prores||png);
    exportAbort.signal.throwIfAborted();await releaseExport();exportSize=size;
    const result=await exportMp4({transparent,transparentFormat,fileHandle,canvas,draw:time=>{position=time;drawFrame(time);},song,tracks,external:{...external},settings:{...settings},volume:Number($('volume').value),speed,start,end,...size,fps:Number($('fps').value),bitrate:Number($('bitrate').value),includeAudio:$('export-audio').checked,signal:exportAbort.signal,onProgress:message=>$('record-label').textContent=message});
    $('export-result').textContent=exportReport(result.stats,(rangeEnd-rangeStart)/speed);
    if(result.blob){const url=URL.createObjectURL(result.blob);lastExport={url,cleanup:result.cleanup};const link=$('download-mp4');link.href=url;link.download=filename;link.textContent=`Download ${label}`;link.hidden=false;link.click();toast(`Your ${label} is ready. Use Download ${label} if the download did not start.`);}
    else toast(`Your ${label} has been saved to disk.`);
  }catch(e){toast(e.name==='AbortError'?`${label} export cancelled.`:e.message||`${label} export failed. Try a lower resolution.`);}
  finally{exportSize=null;directExport=false;exportAbort=null;recordUI(false);updateFrameChoice();position=clamp(oldPosition,0,song.duration);drawFrame();updatePlay();}
}
async function startRecording(){
  if(recording||assetBusy)return;if($('export-transparent').checked){toast('Use direct export to preserve transparency.');return;}if(typeof MediaRecorder==='undefined'||!canvas.captureStream){toast('Video recording is not supported in this browser. Try Chrome or Edge on desktop.');return;}
  try{await synth.init();pause();validLoop();exportSize=getFrameSize();
    recordStart=$('export-range').value==='loop'?loopA:0;recordStop=$('export-range').value==='loop'?loopB:song.duration;position=recordStart;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    captureStream=canvas.captureStream(Number($('fps').value));if($('export-audio').checked)for(const t of synth.destination.stream.getAudioTracks())captureStream.addTrack(t.clone());
    const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];recordMime=types.find(t=>MediaRecorder.isTypeSupported(t));if(!recordMime)throw Error('Your browser has no supported video encoder. Try Chrome or Edge.');
    recorder=new MediaRecorder(captureStream,{mimeType:recordMime,videoBitsPerSecond:Number($('bitrate').value)});recordChunks=[];cancelled=false;
    recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};recorder.onerror=e=>{finishRecording(true);toast(e.error?.message||'Video recording failed. Try a lower resolution.');};
    recorder.onstop=()=>{if(!cancelled&&recordChunks.length){saveBlob(new Blob(recordChunks,{type:recordMime}),`${safeName()}-prism.${recordMime.includes('mp4')?'mp4':'webm'}`);toast('Your video is ready.');}recordChunks=[];captureStream?.getTracks().forEach(t=>t.stop());captureStream=null;exportSize=null;recorder=null;recordUI(false);};
    recordUI(true);recorder.start(1000);anchorPos=position;anchorTime=synth.ctx.currentTime;nextNote=lowerBound(position);synth.setVolume(Number($('volume').value));synth.setSpace(settings.space);scheduleHeld(position);startExternal();playing=true;updatePlay();schedule();
  }catch(e){if(recorder?.state==='recording')recorder.stop();captureStream?.getTracks().forEach(t=>t.stop());captureStream=null;exportSize=null;recordUI(false);toast(e.message||'Could not start recording.');}
}
function finishRecording(cancel){cancelled=cancel;pause();if(!cancel)position=recordStop;recording=false;if(recorder&&recorder.state!=='inactive')recorder.stop();else{exportSize=null;recordUI(false);}if(cancel)toast('Recording cancelled.');}
$('open-file').addEventListener('click',()=>$('file-input').click());$('file-input').addEventListener('change',e=>openFiles(e.target.files));$('add-midi').addEventListener('click',()=>$('add-midi-input').click());$('add-midi-input').addEventListener('change',e=>openFiles(e.target.files,true));$('load-demo').addEventListener('click',()=>loadSong(demoSong(),'First Light',true));
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));$$('[data-panel]').forEach(b=>{b.addEventListener('click',()=>showPanel(b.dataset.panel));b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=$$('[data-panel]'),i=tabs.indexOf(b),n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;showPanel(tabs[n].dataset.panel);tabs[n].focus();});});
$('preset').addEventListener('change',()=>{settings.preset=$('preset').value;[...tracks.values()].forEach((tr,i)=>tr.color=palettes[settings.preset][i%6]);syncPalette();buildTracks();persist();});$('reset').addEventListener('click',()=>{settings={...defaults};palettes.custom=settings.customColors.split(',');buildControls();[...tracks.values()].forEach((tr,i)=>tr.color=palettes.aurora[i%6]);buildTracks();reschedule();synth.setSpace(settings.space);toast('Visual and sound settings reset.');});
$('play').addEventListener('click',()=>playing?pause():play());$('restart').addEventListener('click',()=>seek(loop?loopA:0));$('seek').addEventListener('input',()=>seek(Number($('seek').value)));$('speed').addEventListener('change',()=>{const was=playing;pause();speed=Number($('speed').value);if(was)play();});$('volume').addEventListener('input',()=>synth.setVolume(Number($('volume').value)));
$('loop-toggle').addEventListener('click',()=>{validLoop();loop=!loop;$('loop-toggle').setAttribute('aria-pressed',loop);$('loop-controls').hidden=!loop;if(loop&&playing&&(now()<loopA||now()>=loopB))seek(loopA);else reschedule();});for(const id of ['loop-start','loop-end'])$(id).addEventListener('change',validLoop);$('loop-set-start').addEventListener('click',()=>{$('loop-start').value=now().toFixed(1);validLoop();});$('loop-set-end').addEventListener('click',()=>{$('loop-end').value=now().toFixed(1);validLoop();});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('stage').requestFullscreen)await $('stage').requestFullscreen();else toast('Fullscreen is not supported in this browser.');}catch{toast('Fullscreen is unavailable in this view.');}});
$('export-open').addEventListener('click',()=>{showPanel('export');if(window.innerWidth<741)$('panel-export').scrollIntoView({behavior:'smooth',block:'start'});});$('fast-export').addEventListener('click',()=>{if(recording||assetBusy)return;try{const size=getFrameSize();$('aspect').value='custom';$('aspect-width').value=size.width;$('aspect-height').value=size.height;$('resolution').value='1280';$('fps').value='30';$('export-transparent').checked=true;$('transparent-format').value='png';updateFrameChoice();toast('PNG MOV selected at 1280px longest edge / 30 fps.');}catch(error){toast(error.message);}});$('record').addEventListener('click',()=>startDirectExport());$('record-test').addEventListener('click',()=>startDirectExport(true));$('record-live').addEventListener('click',startRecording);$('cancel-record').addEventListener('click',()=>{if(directExport){exportAbort.abort();$('record-label').textContent='Cancelling…';}else finishRecording(true);});$('snapshot').addEventListener('click',()=>canvas.toBlob(blob=>{if(blob)saveBlob(blob,`${safeName()}-prism.png`);else toast('Could not save the snapshot.');},'image/png'));
$('help').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
document.addEventListener('keydown',e=>{if(recording||assetBusy||e.ctrlKey||e.metaKey||e.altKey||$('help-dialog').open||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;if(e.code==='Space'||e.key.toLowerCase()==='k'){e.preventDefault();playing?pause():play();}else if(e.key==='ArrowRight'){e.preventDefault();seek(now()+5);}else if(e.key==='ArrowLeft'){e.preventDefault();seek(now()-5);}else if(e.key.toLowerCase()==='r')seek(loop?loopA:0);else if(e.key.toLowerCase()==='f')$('fullscreen').click();});
document.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types.includes('Files')||recording)return;e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;});document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});document.addEventListener('dragleave',e=>{if(!e.dataTransfer?.types.includes('Files'))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('drop-overlay').hidden=true;});document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if(!recording)openFiles(e.dataTransfer?.files,true);});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install').hidden=false;});$('install').addEventListener('click',async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('install').hidden=true;}});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
function drawAudioWaveform(){
 const c=$('audio-waveform'),g=c.getContext('2d'),w=c.width,h=c.height;g.clearRect(0,0,w,h);if(!external.buffer||!song)return;
 g.fillStyle='#76d4da';
 for(let x=0;x<w;x++){const at=(x/w*song.duration-external.offset)*external.rate/external.buffer.duration,index=Math.floor(at*external.peaks.length);const peak=index>=0&&index<external.peaks.length?external.peaks[index]:0;g.fillRect(x,h*.6-peak*h*.32,1,Math.max(1,peak*h*.64));}
 g.fillStyle='#baa3ff';for(let i=0;i<song.notes.length;i+=Math.max(1,Math.floor(song.notes.length/10000))){const n=song.notes[i];g.fillRect(n.start/song.duration*w,3,1,8+n.velocity*9);}
}
function syncAudioControls(){
 $('audio-controls').hidden=!external.buffer;$('audio-info').textContent=external.buffer?`${external.name} · ${fmt(external.buffer.duration)} · Exports follow the MIDI range.`:'Use the matching recording for your MIDI. MP3, WAV, FLAC, M4A or OGG, where supported.';
 $('audio-mode').value=external.mode;$('audio-offset').value=external.offset.toFixed(3);$('audio-rate').value=external.rate.toFixed(3);$('audio-gain').value=external.gain;$('audio-gain-label').textContent=`${Math.round(external.gain*100)}%`;drawAudioWaveform();
}
function mediaLoading(on){assetBusy=on;for(const id of ['open-audio','open-background','open-file','add-midi','load-demo','record','record-test','fast-export','record-live','play','seek','restart','speed','loop-toggle'])$(id).disabled=on;}
async function openAudio(file){
 if(!file||recording||assetBusy)return;
 if(file.size>150*1024*1024){toast('Choose an audio file smaller than 150 MB.');return;}
 pause();mediaLoading(true);$('audio-info').textContent='Loading audio…';
 try{await synth.init();const buffer=await synth.ctx.decodeAudioData(await file.arrayBuffer());if(buffer.length*buffer.numberOfChannels*4>512*1024*1024)throw Error('This decoded audio is too large. Try a shorter audio file.');
  const alignment=pendingSceneAudio&&pendingSceneAudio.name===file.name?pendingSceneAudio:{mode:'file',offset:0,rate:1,gain:1};Object.assign(external,alignment,{buffer,name:file.name,peaks:makeWaveform(buffer)});if(alignment===pendingSceneAudio)pendingSceneAudio=null;syncAudioControls();toast('Audio added. Adjust its start time if the recording has an intro.');
 }catch(e){syncAudioControls();toast(e.message?.includes('too large')?e.message:'Could not decode this audio. Try a WAV or MP3 file.');}
 finally{mediaLoading(false);$('audio-input').value='';}
}
function changeAudioTiming(){external.offset=clamp(Number($('audio-offset').value)||0,-3600,3600);external.rate=clamp(Number($('audio-rate').value)||1,.25,4);syncAudioControls();reschedule();}
$('open-audio').addEventListener('click',()=>$('audio-input').click());$('audio-input').addEventListener('change',e=>openAudio(e.target.files[0]));
$('remove-audio').addEventListener('click',()=>{pause();Object.assign(external,{buffer:null,peaks:null,name:'',mode:'synth',offset:0,rate:1,gain:1});syncAudioControls();});
$('audio-mode').addEventListener('change',()=>{external.mode=$('audio-mode').value;reschedule();});
for(const id of ['audio-offset','audio-rate'])$(id).addEventListener('change',changeAudioTiming);
for(const [id,delta] of [['audio-earlier',-.01],['audio-later',.01]])$(id).addEventListener('click',()=>{$('audio-offset').value=(external.offset+delta).toFixed(3);changeAudioTiming();});
$('audio-align').addEventListener('click',()=>{$('audio-offset').value=now().toFixed(3);changeAudioTiming();});
$('audio-reset').addEventListener('click',()=>{$('audio-offset').value=0;$('audio-rate').value=1;changeAudioTiming();});
$('audio-fit').addEventListener('click',()=>{const remaining=song.duration-external.offset;if(remaining<=0){toast('Set the audio start before the MIDI ends.');return;}const rate=external.buffer.duration/remaining;if(rate<.25||rate>4){toast('These durations are too different to fit within the timing range.');return;}$('audio-rate').value=rate.toFixed(3);changeAudioTiming();});
$('audio-gain').addEventListener('input',()=>{external.gain=Number($('audio-gain').value);$('audio-gain-label').textContent=`${Math.round(external.gain*100)}%`;externalVoice?.setGain(external.gain);});
$('audio-waveform').addEventListener('click',e=>{if(recording)return;const r=e.currentTarget.getBoundingClientRect();seek(clamp((e.clientX-r.left)/r.width,0,1)*song.duration);});
$('audio-waveform').addEventListener('keydown',e=>{if(recording)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();seek(now()+(e.key==='ArrowLeft'?-1:1));}});

async function openBackground(file){
 if(!file||recording||assetBusy)return;if(file.size>25*1024*1024){toast('Choose a background image smaller than 25 MB.');return;}
 mediaLoading(true);const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>64000000)throw Error('Image too large');
  const factor=Math.min(1,4096/Math.max(img.naturalWidth,img.naturalHeight));const bitmap=await createImageBitmap(img,{resizeWidth:Math.max(1,Math.round(img.naturalWidth*factor)),resizeHeight:Math.max(1,Math.round(img.naturalHeight*factor)),resizeQuality:'high'});
  backgroundImage?.close();backgroundImage=bitmap;backgroundName=file.name;$('background-info').textContent=file.name;$('remove-background').hidden=false;toast('Background added. Try a scene preset or adjust its effects.');
 }catch{toast('Could not load this image. Try a JPG, PNG or WebP under 64 megapixels.');}finally{URL.revokeObjectURL(url);mediaLoading(false);$('background-input').value='';}
}
$('open-background').addEventListener('click',()=>$('background-input').click());$('background-input').addEventListener('change',e=>openBackground(e.target.files[0]));
$('remove-background').addEventListener('click',()=>{backgroundImage?.close();backgroundImage=null;backgroundName='';$('background-info').textContent='JPG, PNG, WebP or AVIF · stays on this device';$('remove-background').hidden=true;});
$$('[data-atmosphere]').forEach(button=>button.addEventListener('click',()=>{Object.assign(settings,{dustEnabled:true},atmospherePresets[button.dataset.atmosphere]);buildControls();persist();}));
const scenePresets={cinematic:{bgMotion:'drift',bgMovement:.45,bgBlur:2,bgDim:.4,bgVignette:.75,bgTintAmount:.1,bgPulse:.3},dreamy:{bgMotion:'zoom',bgMovement:.7,bgBlur:10,bgDim:.25,bgVignette:.45,bgTintAmount:.25,bgPulse:.65},clean:{bgMotion:'still',bgMovement:0,bgBlur:0,bgDim:.15,bgVignette:.2,bgTintAmount:0,bgPulse:0}};
$$('[data-scene]').forEach(button=>button.addEventListener('click',()=>{Object.assign(settings,scenePresets[button.dataset.scene]);buildControls();persist();}));
function captureFrameSettings(){
 getFrameSize();return {aspect:$('aspect').value,width:$('aspect-width').value,height:$('aspect-height').value,resolution:$('resolution').value,pixelWidth:$('resolution-width').value,pixelHeight:$('resolution-height').value,transparent:$('export-transparent').checked,transparentFormat:$('transparent-format').value,fps:$('fps').value,bitrate:$('bitrate').value,range:$('export-range').value,includeAudio:$('export-audio').checked};
}
function captureScene(){return {format:'prism-scene',version:2,settings:{...settings},tracks:[...tracks.values()].map(({id,name,color,visible,mute,solo,volume,pan,instrument})=>({id,name,color,visible,mute,solo,volume,pan,instrument})),frame:captureFrameSettings(),playback:{speed,volume:Number($('volume').value),loop,loopStart:loopA,loopEnd:loopB},audio:{name:external.name,mode:external.mode,offset:external.offset,rate:external.rate,gain:external.gain},media:{midi:title,midiFiles:midiSources.map(s=>s.name),audio:external.name,image:backgroundName}};}
function restoreTrackSettings(savedTracks){for(const tr of tracks.values()){const saved=savedTracks.find(t=>t.id===tr.id&&t.name===tr.name)||((song.sources?.length===1)?savedTracks.find(t=>t.id===tr.originalId&&t.name===tr.originalName):null);if(saved){const {id,name,color,...mix}=saved;Object.assign(tr,mix);if(color)tr.color=color;}}}
function restorePlayback(p){if(!p)return;speed=p.speed;$('speed').value=String(speed);if(!$('speed').value){speed=1;$('speed').value='1';}$('volume').value=p.volume;synth.setVolume(p.volume);$('loop-start').value=p.loopStart;$('loop-end').value=p.loopEnd;validLoop();loop=p.loop;$('loop-toggle').setAttribute('aria-pressed',loop);$('loop-controls').hidden=!loop;}
function restoreScene(data){
 const parsed=parseScene(data,defaults,groups,palettes,modeNames);pause();settings=parsed.settings;palettes.custom=settings.customColors.split(',');
 const f=parsed.frame;if(f){for(const [key,id] of Object.entries({aspect:'aspect',width:'aspect-width',height:'aspect-height',resolution:'resolution',pixelWidth:'resolution-width',pixelHeight:'resolution-height',transparentFormat:'transparent-format',fps:'fps',bitrate:'bitrate',range:'export-range'}))$(id).value=f[key];$('export-transparent').checked=f.transparent;$('export-audio').checked=f.includeAudio;updateFrameChoice();}
 if(parsed.audio){pendingSceneAudio=parsed.audio;if(external.buffer&&external.name===parsed.audio.name){Object.assign(external,parsed.audio);pendingSceneAudio=null;}else if(!external.buffer){Object.assign(external,parsed.audio);}}
 restorePlayback(parsed.playback);pendingScenePlayback=parsed.media.midi&&parsed.media.midi!==title?{title:parsed.media.midi,settings:parsed.playback}:null;
 buildControls();[...tracks.values()].forEach((tr,i)=>tr.color=parsed.trackColors[i]||palettes[settings.preset][i%6]);restoreTrackSettings(parsed.tracks);pendingSceneTracks=parsed.tracks;
 buildTracks();syncAudioControls();synth.setSpace(settings.space);reschedule();persist();
 const needed=[];if(Array.isArray(parsed.media.midiFiles)&&parsed.media.midiFiles.length){const missing=parsed.media.midiFiles.filter(name=>typeof name==='string'&&!midiSources.some(s=>s.name===name));if(missing.length)needed.push('MIDI files: '+missing.join(', '));}else if(parsed.media.midi&&parsed.media.midi!==title)needed.push('MIDI: '+parsed.media.midi);if(parsed.audio?.name&&(!external.buffer||external.name!==parsed.audio.name))needed.push('audio: '+parsed.audio.name);if(parsed.media.image&&(!backgroundImage||backgroundName!==parsed.media.image))needed.push('image: '+parsed.media.image);
 $('scene-status').textContent=needed.length?'Scene restored. Reselect '+needed.join('; ')+'.':'Scene settings restored, including all particle layers.';toast('Scene settings imported.');
}
$('save-look').addEventListener('click',()=>{try{saveBlob(new Blob([JSON.stringify(captureScene(),null,2)],{type:'application/json'}),`${safeName()}-scene.json`);$('scene-status').textContent='Scene settings exported. Media files are referenced by name and remain separate.';}catch(error){toast(error.message);}});
$('load-look').addEventListener('click',()=>$('look-input').click());
$('look-input').addEventListener('change',async e=>{if(recording||assetBusy)return;const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Choose a scene settings JSON smaller than 1 MB.');const data=JSON.parse(await file.text());if(recording||assetBusy)return;restoreScene(data);}catch(error){toast(error.message||'Could not import scene settings.');}finally{$('look-input').value='';}});
let previewRatio=16/9;
function getFrameSize(){return $('resolution').value==='custom'?resolveCustomResolution($('resolution-width').value,$('resolution-height').value):resolveFrame($('aspect').value,$('aspect-width').value,$('aspect-height').value,Number($('resolution').value));}
function fitPreview(){const stage=$('stage');const size=fitFrame(stage.clientWidth,stage.clientHeight,previewRatio);canvas.style.width=`${size.width}px`;canvas.style.height=`${size.height}px`;}
function updateFrameChoice(){
 const custom=$('resolution').value==='custom',transparent=$('export-transparent').checked;
 $('custom-resolution').hidden=!custom;$('custom-aspect').hidden=custom||$('aspect').value!=='custom';$('aspect').disabled=custom||recording;
 canvas.classList.toggle('transparent-preview',transparent);const prores=transparent&&$('transparent-format').value==='prores',png=transparent&&$('transparent-format').value==='png';
 $('record').textContent=png?'Export PNG MOV':prores?'Export ProRes MOV':transparent?'Export transparent WebM':'Export MP4';$('transparent-format-field').hidden=!transparent;$('bitrate').disabled=prores||png||recording;
 $('format-note').textContent=png?'PNG MOV: lossless color + transparency in a single Adobe-compatible video. Native PNG compression is suited to notes and graphics with empty backgrounds. Optional 16-bit stereo PCM sound. Size and speed depend on the scene; run a 3-second test to measure both.':prores?'ProRes 4444: large editing master files and CPU-heavy encoding. A 300 MB / 3s test projects to about 18 GB for 3 minutes. Try PNG MOV for transparent graphics. Lowering the bitrate selector does not change ProRes size.':'The bitrate selector controls MP4 / WebM compression quality.';

 try{const size=getFrameSize();previewRatio=size.ratio;fitPreview();$('frame-error').hidden=true;
  $('frame-info').textContent=`${size.width} × ${size.height} px. Preview and export use this frame. ${custom?'Exact pixel dimensions set the aspect ratio.':'Preset sizes round to even pixels.'} Encoder support depends on your browser and device.`;
  $('record').disabled=recording||assetBusy;$('record-test').disabled=recording||assetBusy;$('record-live').disabled=recording||assetBusy||transparent;
  try{localStorage.setItem('prism-frame',JSON.stringify({aspect:$('aspect').value,width:$('aspect-width').value,height:$('aspect-height').value,resolution:$('resolution').value,pixelWidth:$('resolution-width').value,pixelHeight:$('resolution-height').value,transparentFormat:$('transparent-format').value,transparentFormatRevision:2,transparent}));}catch{}
 }catch(error){$('frame-error').textContent=error.message;$('frame-error').hidden=false;$('record').disabled=true;$('record-test').disabled=true;$('record-live').disabled=true;}
}
try{const frame=JSON.parse(localStorage.getItem('prism-frame')||'null');if(frame&&['1.7777777778','0.5625','1','custom'].includes(frame.aspect)&&['1280','1920','3840','custom'].includes(frame.resolution)){
 if(frame.resolution==='custom')resolveCustomResolution(frame.pixelWidth,frame.pixelHeight);else resolveFrame(frame.aspect,frame.width,frame.height,Number(frame.resolution));
 $('aspect').value=frame.aspect;$('aspect-width').value=frame.width;$('aspect-height').value=frame.height;$('resolution').value=frame.resolution;$('resolution-width').value=frame.pixelWidth||1920;$('resolution-height').value=frame.pixelHeight||1080;$('export-transparent').checked=frame.transparent===true;$('transparent-format').value=frame.transparentFormat==='webm'?'webm':frame.transparentFormatRevision===2&&frame.transparentFormat==='prores'?'prores':'png';
}}catch{}
for(const id of ['aspect','resolution','export-transparent','transparent-format'])$(id).addEventListener('change',updateFrameChoice);
for(const id of ['aspect-width','aspect-height','resolution-width','resolution-height'])$(id).addEventListener('input',updateFrameChoice);
if(globalThis.ResizeObserver)new ResizeObserver(fitPreview).observe($('stage'));else window.addEventListener('resize',fitPreview);
document.addEventListener('fullscreenchange',fitPreview);
updateFrameChoice();
for(const [value,name] of Object.entries(paletteNames)){const option=document.createElement('option');option.value=value;option.textContent=name;$('preset').append(option);}
for(let i=0;i<6;i++){const label=document.createElement('label');label.textContent=String(i+1);const input=document.createElement('input');input.type='color';input.value=palettes.custom[i];input.setAttribute('aria-label',`Custom palette color ${i+1}`);input.addEventListener('input',()=>{palettes.custom[i]=input.value;settings.customColors=palettes.custom.join(',');[...tracks.values()].forEach((tr,j)=>tr.color=palettes.custom[j%6]);syncPalette();buildTracks();persist();});label.append(input);$('custom-palette').append(label);}
buildControls();loadSong(demoSong(),'First Light',true);render();

