import test from 'node:test';
import assert from 'node:assert/strict';
import {audioPlacement,scheduleAudioBuffer,makeWaveform} from '../dist/audio-sync.js';
import {drawParticles,drawBackground,drawExtraScene,palettes} from '../dist/studio-visuals.js';

test('audio offset, seek, global speed and timing rate share an exact mapping',()=>{
 assert.deepEqual(audioPlacement(0,10,2,1,1,20),{delay:2,bufferOffset:0,duration:8,playbackRate:1});
 assert.deepEqual(audioPlacement(3,10,-1,1,1,20),{delay:0,bufferOffset:4,duration:7,playbackRate:1});
 assert.deepEqual(audioPlacement(5,9,1,1.5,2,30),{delay:0,bufferOffset:6,duration:2,playbackRate:3});
 assert.equal(audioPlacement(12,20,0,1,1,10),null);
 const first=audioPlacement(0,15,2,1.25,1.5,20),second=audioPlacement(5,15,2,1.25,1.5,20);
 assert.equal(first.bufferOffset+(5-2)*first.playbackRate/1.5,second.bufferOffset);
});
test('preview and offline contexts schedule the same section with a different clock origin',()=>{
 function context(now){const calls=[];return {currentTime:now,calls,createBufferSource(){return {playbackRate:{},connect(){},disconnect(){},start(...a){calls.push(['start',...a]);},stop(...a){calls.push(['stop',...a]);}};},createGain(){return {gain:{},connect(){},disconnect(){}};}};}
 const live=context(42),offline=context(0),config={offset:2,rate:1.2,gain:.7};
 scheduleAudioBuffer(live,{duration:20},config,5,10,2,{});scheduleAudioBuffer(offline,{duration:20},config,5,10,2,{});
 assert.equal(live.calls[0][1]-42,offline.calls[0][1]);assert.equal(live.calls[0][2],offline.calls[0][2]);assert.equal(live.calls[1][1]-42,offline.calls[1][1]);
});
function context(){const calls=[];const methods=['save','restore','beginPath','arc','fill','stroke','fillRect','moveTo','lineTo','fillText','drawImage'];const ctx={calls,createRadialGradient(){return {addColorStop(){}};}};for(const method of methods)ctx[method]=(...args)=>{assert.ok(args.every(x=>typeof x!=='number'||Number.isFinite(x)));calls.push([method,...args]);};return ctx;}
const settings={particles:true,particleCount:30,particleVelocity:false,particleMotion:'burst',particleShape:'dots',particleLife:1,particleSize:2,particleSpread:40,glow:10};
const note={pitch:60,start:1,end:2,duration:1,velocity:.5,trackId:1};
test('particles respect hit timing, selected amount, velocity scaling, and frame budget',()=>{
 const a=context();drawParticles(a,note,.9,100,100,0,'#fff',settings,{left:6000});assert.equal(a.calls.length,0);
 drawParticles(a,note,1.2,100,100,0,'#fff',settings,{left:6000});assert.equal(a.calls.filter(c=>c[0]==='arc').length,30);
 const b=context();drawParticles(b,note,1.2,100,100,0,'#fff',{...settings,particleVelocity:true},{left:6000});assert.equal(b.calls.filter(c=>c[0]==='arc').length,15);
 const c=context();drawParticles(c,note,1.2,100,100,0,'#fff',settings,{left:7});assert.equal(c.calls.filter(c=>c[0]==='arc').length,7);
 const d=context();drawParticles(d,note,2.1,100,100,0,'#fff',settings,{left:6000});assert.equal(d.calls.length,0);
});
test('background motion and new scenes are deterministic at a fixed export timestamp',()=>{
 const s={...settings,bgMotion:'drift',bgMovement:.5,bgSpeed:1,bgOpacity:1,bgBlur:4,bgBrightness:1,bgPulse:.4,bgSaturation:80,bgTint:'#aa88cc',bgTintAmount:.2,bgDim:.3,bgVignette:.6,bgDust:10,keyboard:true,keyLabels:true,grid:true,playhead:true,playheadColor:'#fff',playheadWidth:1,orbitRadius:.25,pulseHeight:1,timeWindow:7,transpose:0,opacity:.9,noteWidth:.8,velocitySize:true};
 const a=context(),b=context();drawBackground(a,{width:1920,height:1080},800,500,1.2,s,'#aa88cc',.5);drawBackground(b,{width:1920,height:1080},800,500,1.2,s,'#aa88cc',.5);assert.deepEqual(a.calls,b.calls);assert.ok(a.calls.some(c=>c[0]==='drawImage'));
 for(const mode of ['orbit','pulse']){const x=context(),y=context();const options={mode,w:800,h:500,t:1.2,s,notes:[note],tracks:new Map([[1,{visible:true}]]),min:48,max:72,colorFor:()=>palettes.aurora[0],noteName:p=>String(p)};drawExtraScene(x,{...options,budget:{left:6000}});drawExtraScene(y,{...options,budget:{left:6000}});assert.deepEqual(x.calls,y.calls);assert.ok(x.calls.length>20);}
});
