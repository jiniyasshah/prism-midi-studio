import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parseScene} from '../dist/scene-settings.js';
import {palettes,modeNames} from '../dist/studio-visuals.js';
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const defaults=vm.runInNewContext('('+app.match(/const defaults=(\{[^\n]+\});/)[1]+')',{palettes});
const groupCode=app.slice(app.indexOf('const originalGroups='),app.indexOf('const synth=new Synth();'));
const groups=vm.runInNewContext(groupCode+';groups');
const parse=data=>parseScene(data,defaults,groups,palettes,modeNames);
test('scene settings round trip includes particles, switches, custom frame, track mix and audio timing',()=>{
 const data={format:'prism-scene',version:2,settings:{...defaults,dustShape:'petals',dustFlutter:1.25,dustSpin:2,dustEnabled:false,bgDust:117,keyboard:false,grid:false},tracks:[{id:1,name:'Piano',color:'#123456',volume:.4,pan:-.3,instrument:'auto',visible:false,mute:true,solo:false}],audio:{name:'recording.wav',mode:'blend',offset:-.23,rate:1.02,gain:.7},frame:{aspect:'custom',width:'4',height:'5',resolution:'custom',pixelWidth:'1200',pixelHeight:'1500',transparent:true,transparentFormat:'prores',compactQuality:'high',fps:'60',bitrate:'25000000',range:'loop',includeAudio:true},playback:{speed:1.5,volume:.8,loop:true,loopStart:2,loopEnd:12}};
 const restored=parse(JSON.parse(JSON.stringify(data)));for(const key of ['dustShape','dustFlutter','dustSpin','dustEnabled','bgDust','keyboard','grid'])assert.equal(restored.settings[key],data.settings[key]);
 assert.deepEqual(restored.tracks,data.tracks);assert.deepEqual(restored.frame,data.frame);assert.deepEqual(restored.audio,data.audio);assert.deepEqual(restored.playback,data.playback);
});
test('legacy looks import and malformed data cannot inject controls or invalid export dimensions',()=>{
 const legacy=parse({format:'prism-look',version:1,settings:{bgDust:42,dustShape:'stars'},trackColors:['#112233']});assert.equal(legacy.settings.bgDust,42);assert.equal(legacy.settings.dustEnabled,true);
 const bad=parse({format:'prism-scene',version:2,settings:{dustShape:'unknown',dustSize:1e9,dustColor:'javascript:alert(1)',dustSpeed:null,extra:'injected'}});assert.equal(bad.settings.dustShape,defaults.dustShape);assert.equal(bad.settings.dustSize,18);assert.equal(bad.settings.dustColor,defaults.dustColor);assert.equal(bad.settings.extra,undefined);
 assert.throws(()=>parse({format:'prism-scene',version:2,settings:{},frame:{resolution:'custom',pixelWidth:1001,pixelHeight:1080}}),/even/);
 assert.throws(()=>parse({format:'unknown',settings:{}}));
});
test('all settings are grouped once, including quick visibility switches',()=>{
 const keys=groups.flatMap(g=>g.items.map(x=>x[0]));assert.equal(keys.length,new Set(keys).size);
 for(const key of Object.keys(defaults))if(!['preset','mode','customColors'].includes(key))assert.ok(keys.includes(key),key);
 const visibility=groups.find(g=>g.id==='visibility').items.map(x=>x[0]);for(const key of ['keyboard','grid','octaveLines','beatLines','particles','dustEnabled','imageEnabled','noteLabels'])assert.ok(visibility.includes(key));
});

