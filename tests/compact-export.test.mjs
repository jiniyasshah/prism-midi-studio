import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {compactBudget,splitStraightRgba,afterEffectsImport,compactInstructions} from '../dist/compact-export.js';
import {writeStoredZip} from '../dist/zip-store.js';
import {createExportDestination} from '../dist/export-storage.js';

test('balanced 193.5 second export targets hundreds of MB with a hard allowance',()=>{
 const b=compactBudget(193.5,'balanced',true);assert.equal(b.estimatedBytes,249615000);assert.ok(b.maxBytes<350*1024**2);assert.ok(b.maxBytes>b.estimatedBytes);
 assert.ok(compactBudget(193.5,'small',true).estimatedBytes<b.estimatedBytes);assert.ok(compactBudget(193.5,'high',true).estimatedBytes>b.estimatedBytes);
 assert.equal(compactBudget(10,'balanced',true).estimatedBytes-compactBudget(10,'balanced',false).estimatedBytes,400000);
});
test('straight color and grayscale matte recover partially transparent glows without double premultiplication',()=>{
 const original=Uint8ClampedArray.from([240,80,160,128,120,180,230,0,90,40,20,255]),color=original.slice(),matte=new Uint8ClampedArray(color.length);splitStraightRgba(color,matte);
 assert.deepEqual(Array.from(color),[240,80,160,255,120,180,230,255,90,40,20,255]);assert.deepEqual(Array.from(matte),[128,128,128,255,0,0,0,255,255,255,255,255]);
 for(let i=0;i<original.length;i+=4)for(let c=0;c<3;c++)assert.equal(color[i+c]*matte[i]/255,original[i+c]*original[i+3]/255);
});
test('ZIP streams valid CRC-checked files and the Adobe import helper',async()=>{
 const dst=await createExportDestination({raw:true,estimatedBytes:0,mimeType:'application/zip',maxBytes:1024**2});const info={width:1920,height:1080,fps:30,duration:193.5};
 const entries=[{name:'color.mp4',blob:new Blob(['color bytes'])},{name:'alpha.mp4',blob:new Blob(['alpha bytes'])},{name:'README.txt',blob:new Blob([compactInstructions(info)])},{name:'Import into After Effects.jsx',blob:new Blob([afterEffectsImport(info)])}];
 const size=await writeStoredZip(dst,entries,new AbortController().signal);const result=await dst.finish();assert.equal(result.blob.size,size);
 const check=spawnSync('python',['-c',"import io,sys,zipfile,json\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.testzip() is None\nassert z.read('color.mp4') == b'color bytes'\nassert z.read('alpha.mp4') == b'alpha bytes'\nprint(json.dumps(z.namelist()))"],{input:Buffer.from(await result.blob.arrayBuffer())});assert.equal(check.status,0,check.stderr.toString());assert.equal(JSON.parse(check.stdout).length,4);
});
test('raw destination enforces size limits on disk and in memory',async()=>{
 for(const disk of [false,true]){let writes=0,aborted=false;const fileHandle=disk?{createWritable:async()=>({write:async()=>writes++,close:async()=>{},abort:async()=>{aborted=true;}})}:undefined;
  const dst=await createExportDestination({fileHandle,raw:true,estimatedBytes:0,maxBytes:10});await dst.write(new Uint8Array(8),0);await assert.rejects(dst.write(new Uint8Array(4),8),/size limit/);await dst.abort();if(disk){assert.equal(writes,1);assert.equal(aborted,true);}
 }
});
test('After Effects helper creates a luma matte without replacing or saving the current project',()=>{
 for(const modern of [true,false]){const calls=[],layers=[];const comp={layers:{add:footage=>{const layer={footage};if(modern)layer.setTrackMatte=(matte,type)=>{layer.matte=matte;layer.type=type;};layers.push(layer);return layer;}},openInViewer:()=>calls.push('open')};
  function File(path){if(!new.target)return new File(path);this.fsName=path;this.exists=true;this.parent={fsName:'/package'};}
  const app={project:{importFile:option=>option,items:{addComp:(...args)=>{calls.push(args);return comp;}}},newProject:()=>assert.fail('must not replace project'),beginUndoGroup:()=>calls.push('begin'),endUndoGroup:()=>calls.push('end')};
  vm.runInNewContext(afterEffectsImport({width:1920,height:1080,fps:30,duration:193.5}),{app,File,$:{fileName:'/package/import.jsx'},ImportOptions:function(file){this.file=file},TrackMatteType:{LUMA:3818},alert:message=>assert.fail(message)});
  assert.equal(layers[1].enabled,false);assert.equal(layers[0].startTime,0);assert.equal(layers[0].outPoint,193.5);if(modern){assert.equal(layers[0].matte,layers[1]);assert.equal(layers[0].type,3818);}else assert.equal(layers[0].trackMatteType,3818);assert.equal(calls.at(-1),'end');
 }
});
test('cancelled ZIP never completes its entry',async()=>{
 let writes=0;const abort=new AbortController();await assert.rejects(writeStoredZip({write:async()=>{if(++writes===2)abort.abort();}},[{name:'color.mp4',blob:new Blob([new Uint8Array(100000)])}],abort.signal),{name:'AbortError'});assert.equal(writes,2);
});
