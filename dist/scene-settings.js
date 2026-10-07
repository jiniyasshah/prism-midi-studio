import {resolveFrame,resolveCustomResolution} from './frame-size.js';
const color=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const number=(v,fallback,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
const choice=(v,values,fallback)=>values.includes(v)?v:fallback;
export function parseScene(data,defaults,groups,palettes,modes){
 if(!data||!((data.format==='prism-look'&&data.version===1)||(data.format==='prism-scene'&&data.version===2))||!data.settings||typeof data.settings!=='object')throw Error('Choose a Prism scene settings file or a saved Prism look.');
 const settings={...defaults};
 for(const key of Object.keys(defaults)){const v=data.settings[key];if(typeof v===typeof defaults[key]&&(typeof v!=='number'||Number.isFinite(v)))settings[key]=v;}
 for(const group of groups)for(const [key,,type,max] of group.items){if(type==='color'&&!color(settings[key]))settings[key]=defaults[key];else if(type==='select')settings[key]=choice(settings[key],max.map(x=>x[0]),defaults[key]);else if(typeof type==='number')settings[key]=number(settings[key],defaults[key],type,max);}
 if(!/^(#[0-9a-f]{6},){5}#[0-9a-f]{6}$/i.test(settings.customColors))settings.customColors=defaults.customColors;
 if(!Object.hasOwn(palettes,settings.preset))settings.preset=defaults.preset;if(!Object.hasOwn(modes,settings.mode))settings.mode=defaults.mode;
 const tracks=Array.isArray(data.tracks)?data.tracks.slice(0,1000).filter(t=>t&&typeof t==='object').map(t=>({id:t.id,name:String(t.name||''),color:color(t.color)?t.color:null,visible:t.visible!==false,mute:t.mute===true,solo:t.solo===true,volume:number(t.volume,1,0,1.5),pan:number(t.pan,0,-1,1),instrument:t.instrument==='auto'?'auto':String(Math.round(number(Number(t.instrument),0,0,127)))})):[];
 let frame=null;if(data.frame){const f=data.frame;frame={aspect:choice(String(f.aspect),['1.7777777778','0.5625','1','custom'],'1.7777777778'),width:String(f.width??21),height:String(f.height??9),resolution:choice(String(f.resolution),['1280','1920','3840','custom'],'1920'),pixelWidth:String(f.pixelWidth??1920),pixelHeight:String(f.pixelHeight??1080),transparent:f.transparent===true,transparentFormat:choice(f.transparentFormat,['png','prores','webm'],'png'),fps:choice(String(f.fps),['30','60'],'30'),bitrate:choice(String(f.bitrate),['5000000','12000000','25000000','50000000','80000000'],'25000000'),includeAudio:f.includeAudio!==false,range:choice(f.range,['all','loop'],'all')};
 if(frame.resolution==='custom')resolveCustomResolution(frame.pixelWidth,frame.pixelHeight);else resolveFrame(frame.aspect,frame.width,frame.height,Number(frame.resolution));}
 const p=data.playback,playback=p?{speed:number(p.speed,1,.25,2),volume:number(p.volume,.7,0,1),loop:p.loop===true,loopStart:number(p.loopStart,0,0,1e9),loopEnd:number(p.loopEnd,1e9,0,1e9)}:null;
 const a=data.audio,audio=a?{name:typeof a.name==='string'?a.name:'',mode:choice(a.mode,['file','synth','blend'],'synth'),offset:number(a.offset,0,-3600,3600),rate:number(a.rate,1,.25,4),gain:number(a.gain,1,0,1.5)}:null;
 return {settings,tracks,frame,playback,audio,trackColors:Array.isArray(data.trackColors)?data.trackColors.filter(color):[],media:data.media&&typeof data.media==='object'?data.media:{}};
}

