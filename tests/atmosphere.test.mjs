import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {palettes} from '../dist/studio-visuals.js';
import {atmosphereFrame,musicalBeat,drawAtmosphere} from '../dist/atmosphere.js';
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const settings=vm.runInNewContext('('+app.match(/const defaults=(\{[^\n]+\});/)[1]+')',{palettes});

test('background particles retain normalized position, size and opacity from 720p to 4K',()=>{
 const low=atmosphereFrame(1280,720,7.2,settings,palettes.aurora,14.4),high=atmosphereFrame(3840,2160,7.2,settings,palettes.aurora,14.4);
 assert.equal(low.length,settings.bgDust);
 for(let i=0;i<low.length;i++)for(const key of ['x','y','size','glow'])assert.ok(Math.abs(high[i][key]-low[i][key]*3)<1e-8,key);
 assert.deepEqual(low.map(p=>p.opacity),high.map(p=>p.opacity));
});
test('beat position follows tempo changes and beat pulse is independent of frame history',()=>{
 const song={ppq:480,tempoMap:[{tick:0,seconds:0,mpqn:500000},{tick:1920,seconds:2,mpqn:1000000}]};
 assert.equal(musicalBeat(song,1),2);assert.equal(musicalBeat(song,3.5),5.5);
 const s={...settings,dustBeat:true,dustTwinkle:0};
 const hit=atmosphereFrame(1280,720,3,s,palettes.aurora,musicalBeat(song,3));
 const between=atmosphereFrame(1280,720,3.5,s,palettes.aurora,musicalBeat(song,3.5));assert.ok(hit[0].size>between[0].size);assert.ok(hit[0].opacity>between[0].opacity);
 atmosphereFrame(1280,720,80,s,palettes.aurora,160);assert.deepEqual(hit,atmosphereFrame(1280,720,3,s,palettes.aurora,musicalBeat(song,3)));
});
test('particle layer renders without an image, respects zero count, and supports all shapes',()=>{
 for(const dustShape of ['dots','bokeh','rings','stars','diamonds','streaks','fire','petals']){
  let paint=0;const ctx={translate(){},rotate(){},scale(){},bezierCurveTo(){},save(){},restore(){},beginPath(){},closePath(){},arc(){},moveTo(){},lineTo(){},fill(){paint++;},stroke(){paint++;}};
  drawAtmosphere(ctx,1280,720,1,{...settings,dustShape},palettes.aurora,{bpm:120});assert.ok(paint>=settings.bgDust);
  paint=0;drawAtmosphere(ctx,1280,720,1,{...settings,bgDust:0},palettes.aurora,{bpm:120});assert.equal(paint,0);
 }
});
test('direction and speed change movement without changing particle identities',()=>{
 const base={...settings,dustMotion:'drift',dustWander:0,dustDirection:0,dustSpeed:.1};
 const a=atmosphereFrame(1280,720,0,base,palettes.aurora,0),b=atmosphereFrame(1280,720,.1,base,palettes.aurora,.2);assert.equal(a[0].y,b[0].y);assert.notEqual(a[0].x,b[0].x);
 const still={...base,dustSpeed:0};assert.deepEqual(atmosphereFrame(1280,720,0,still,palettes.aurora,0).map(p=>[p.x,p.y]),atmosphereFrame(1280,720,20,still,palettes.aurora,40).map(p=>[p.x,p.y]));
});

test('floating layer visibility preserves count and flutter is deterministic',()=>{
 const s={...settings,dustShape:'petals',dustFlutter:1,dustSpin:.7};
 assert.equal(atmosphereFrame(1280,720,3,{...s,dustEnabled:false},palettes.aurora,6).length,0);
 const a=atmosphereFrame(1280,720,3,s,palettes.aurora,6),b=atmosphereFrame(1280,720,4,s,palettes.aurora,8);
 assert.equal(a.length,settings.bgDust);assert.deepEqual(a,atmosphereFrame(1280,720,3,s,palettes.aurora,6));assert.notEqual(a[0].rotation,b[0].rotation);
});
