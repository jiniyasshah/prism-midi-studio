import * as tf from '@tensorflow/tfjs';
import {setWasmPaths} from '@tensorflow/tfjs-backend-wasm';
import {BasicPitch,outputToNotesPoly,noteFramesToTime} from '@spotify/basic-pitch';
export async function loadTranscriber({wasmPath,modelUrl,modelArtifacts}){
 setWasmPaths(wasmPath);
 // Single-threaded SIMD needs no cross-origin isolation on static hosts.
 tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT',false);
 if(!await tf.setBackend('wasm'))throw Error('WebAssembly could not initialize.');
 await tf.ready();
 const model=await tf.loadGraphModel(modelArtifacts?tf.io.fromMemory(modelArtifacts):modelUrl);
 const engine=new BasicPitch(Promise.resolve(model));
 return {
  async transcribe(samples,{onsetThreshold=.5,frameThreshold=.3,minDuration=.07,onProgress=()=>{}}={}){
   const frames=[],onsets=[];
   // Basic Pitch 1.0.1 leaves tensors allocated. Bound their lifetime to this
   // section. Model weights were loaded before the scope and survive it.
   tf.engine().startScope();
   try{
    await engine.evaluateModel(samples,(f,o)=>{frames.push(...f);onsets.push(...o);},onProgress);
    if(!frames.some(row=>row.some(value=>value>frameThreshold)))return [];
    return noteFramesToTime(outputToNotesPoly(frames,onsets,onsetThreshold,frameThreshold,Math.max(1,Math.round(minDuration*22050/256)),true,null,null,false));
   }finally{tf.engine().endScope();}
  },dispose(){model.dispose();}
 };
}
