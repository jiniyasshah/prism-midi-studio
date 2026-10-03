// Execute the vendored browser worker in a real Node thread for codec tests.
// This tests ordered parallel encoding; it does not emulate browser drawing.
import {Worker as NodeWorker} from 'node:worker_threads';
import {resolveObjectURL} from 'node:buffer';
export class WebWorker {
 static active=0;
 static closing=[];
 constructor(url){
  this.pending=[];this.ready=resolveObjectURL(url).text().then(source=>{
   // Emscripten's Node branch uses createRequire(import.meta.url).
   source=source.replaceAll('import.meta.url',JSON.stringify(import.meta.url));
   this.worker=new NodeWorker(`
    const {parentPort}=require('node:worker_threads');
    globalThis.self=globalThis;globalThis.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);
    globalThis.close=()=>process.exit();let waiting=[];
    parentPort.on('message',data=>{if(self.onmessage)self.onmessage({data});else waiting.push(data)});
    import('data:text/javascript;base64,'+${JSON.stringify(Buffer.from(source).toString('base64'))})
     .then(()=>{for(const data of waiting)self.onmessage({data});waiting=[]});
   `,{eval:true});
   WebWorker.active++;
   this.worker.on('exit',()=>WebWorker.active--);
   this.worker.on('message',data=>this.onmessage?.({data}));
   this.worker.on('error',error=>this.onerror?.(error));
   for(const [data,transfer] of this.pending)this.worker.postMessage(data,transfer);this.pending=[];
  }).catch(error=>this.onerror?.(error));
 }
 postMessage(data,transfer){if(this.worker)this.worker.postMessage(data,transfer);else this.pending.push([data,transfer]);}
 terminate(){const closed=this.ready.then(()=>this.worker?.terminate());WebWorker.closing.push(closed);return closed;}
}
