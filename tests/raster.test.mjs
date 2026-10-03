import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {drawAtmosphere} from '../dist/atmosphere.js';
import {drawCreativeScene} from '../dist/creative-scenes.js';
import {palettes} from '../dist/studio-visuals.js';
import {demoSong} from '../dist/midi.js';
const enabled=!!process.env.PRISM_CANVAS_MODULE&&!!process.env.PRISM_RASTER_DIR;
const app=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');
const settings=vm.runInNewContext('('+app.match(/const defaults=(\{[^\n]+\});/)[1]+')',{palettes});

test('floating particles remain visible after real H.264 encoding at 720p and 4K',{skip:!enabled},async()=>{
 const {createCanvas,loadImage}=createRequire(import.meta.url)(process.env.PRISM_CANVAS_MODULE),dir=process.env.PRISM_RASTER_DIR;await mkdir(dir,{recursive:true});
 for(const [w,h] of [[1280,720],[3840,2160]]){
  const canvas=createCanvas(w,h),ctx=canvas.getContext('2d');ctx.fillStyle='#080c17';ctx.fillRect(0,0,w,h);drawAtmosphere(ctx,w,h,7.2,settings,palettes.aurora,{bpm:120});
  const source=`${dir}/particles-${h}.png`,video=`${dir}/particles-${h}.mp4`,decoded=`${dir}/decoded-${h}.png`;await writeFile(source,canvas.toBuffer('image/png'));
  let run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-frames:v','1','-c:v','libx264','-crf','18','-pix_fmt','yuv420p',video],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  run=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',video,'-frames:v','1',decoded],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const count=data=>{let n=0;for(let i=0;i<data.length;i+=4)if(data[i]>30||data[i+1]>34||data[i+2]>45)n++;return n;};
  const original=count(ctx.getImageData(0,0,w,h).data);ctx.drawImage(await loadImage(decoded),0,0);const after=count(ctx.getImageData(0,0,w,h).data);
  assert.ok(original>500);assert.ok(after>original*.7,`${h}p: ${after}/${original} visible pixels`);console.log(`${h}p H.264: ${after} visible particle pixels (${Math.round(after/original*100)}% retained).`);
 }
});
test('new styles produce distinct, repeatable native canvas frames',{skip:!enabled},()=>{
 const {createCanvas}=createRequire(import.meta.url)(process.env.PRISM_CANVAS_MODULE),song=demoSong();const tracks=new Map(song.tracks.map((t,i)=>[t.id,{...t,visible:true,color:palettes.aurora[i%6]}]));const hashes=[];
 for(const mode of ['spiral','tunnel','ripples']){
  const render=()=>{const canvas=createCanvas(1280,720),ctx=canvas.getContext('2d');ctx.fillStyle='#080c17';ctx.fillRect(0,0,1280,720);drawCreativeScene(ctx,{mode,w:1280,h:720,t:7.2,s:settings,notes:song.notes,tracks,min:song.min,max:song.max,colorFor:(n,tr)=>tr.color,noteName:p=>String(p),budget:{left:6000}});return createHash('sha256').update(canvas.toBuffer('image/png')).digest('hex');};
  const hash=render();assert.equal(hash,render());hashes.push(hash);
 }
 assert.equal(new Set(hashes).size,3);
});
