import {loadTranscriber} from './transcription-engine.js';
let engine;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   engine=await loadTranscriber({wasmPath:new URL('./',self.location.href).href,modelUrl:new URL('./model/model.json',self.location.href).href});
   postMessage({type:'ready'});return;
  }
  if(data.type!=='transcribe'||!engine)throw Error('Transcription engine is not ready.');
  const notes=await engine.transcribe(new Float32Array(data.samples),{...data,onProgress:fraction=>postMessage({type:'progress',fraction})});
  postMessage({type:'result',notes});
 }catch(error){postMessage({type:'error',message:error.message||'Audio transcription failed.'});}
};
